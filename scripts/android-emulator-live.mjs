import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createAdminClient, getOwnerBusiness } from "../tests/e2e/helpers/admin-db.mjs";

const base = "https://queuedrop-test.vercel.app";
const pkg = "com.getqueuedrop.printbridge.test";
const admin = createAdminClient();
const owner = await getOwnerBusiness(admin, process.env.E2E_OWNER_EMAIL);
assert.ok(process.env.QUEUEDROP_TEST_SUPABASE_URL.includes("tcgiwtfhqssulxwawimh"), "Dedicated TEST DB required");
const adb = (...args) => execFileSync("adb", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const checked = r => { if (r.error) throw new Error(r.error.message); return r.data; };
const id = crypto.randomUUID();
let branch, browser;
await fs.mkdir("emulator-results", { recursive: true });
try {
  branch = checked(await admin.from("branches").insert({business_id:owner.businessId,name:"E2E Emulator "+id,slug:"e2e-emulator-"+id}).select("id").single());
  const service = checked(await admin.from("services").insert({branch_id:branch.id,name:"Emulator Service",queue_prefix:"EMU",is_active:true}).select("id").single());
  checked(await admin.from("queue_configurations").upsert({branch_id:branch.id,stub_mode_enabled:true,is_active:true,starting_number:1000},{onConflict:"branch_id"}));
  checked(await admin.from("operating_hours").upsert(Array.from({length:7},(_,day_of_week)=>({branch_id:branch.id,day_of_week,is_open:true,open_time:"00:00",close_time:"00:00"})),{onConflict:"branch_id,day_of_week"}));
  const device = checked(await admin.from("devices").insert({branch_id:branch.id,name:"E2E Emulator",device_type:"ticket_terminal",service_id:service.id,is_active:true}).select("id,device_token").single());
  adb("shell","am","force-stop",pkg);
  const prefs = '<?xml version="1.0" encoding="utf-8"?><map><string name="baseUrl">https://getqueuedrop.com/wrong/legacy/path</string><string name="deviceToken">'+device.device_token+'</string></map>';
  // Feed private config over stdin: never echo a device token into runner logs.
  execFileSync("adb",["shell","run-as",pkg,"sh","-c","'mkdir -p shared_prefs; cat > shared_prefs/queuedrop_bridge.xml'"],{input:prefs,stdio:["pipe","pipe","pipe"]});
  adb("shell","am","start","-W","-n",pkg+"/com.getqueuedrop.printbridge.MainActivity");
  let socket;
  for(let i=0;i<30;i++){
    const sockets=adb("shell","cat","/proc/net/unix");
    socket=sockets.match(/@(webview_devtools_remote[^\s]*)/)?.[1];
    if(socket) break;
    await new Promise(r=>setTimeout(r,1000));
  }
  assert.ok(socket,"APK WebView debugging socket must be available");
  adb("forward","tcp:9222","localabstract:"+socket);
  browser=await chromium.connectOverCDP("http://127.0.0.1:9222", { noDefaults: true });
  let page;
  for(let i=0;i<30;i++){
    page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes("/kiosk/"));
    if(page) break;
    await new Promise(r=>setTimeout(r,1000));
  }
  assert.ok(page,"Native WebView must open the live TEST kiosk");
  assert.equal(new URL(page.url()).origin, base, "Legacy URL must be ignored by TEST build");
  const button=page.getByRole("button",{name:"Press here to get stub"});
  await button.waitFor({state:"visible",timeout:60000});
  await button.click();
  await page.locator(".stub-terminal-success").waitFor({state:"visible",timeout:60000});
  const tickets=checked(await admin.from("tickets").select("id,display_number,status").eq("branch_id",branch.id));
  assert.equal(tickets.length,1);
  assert.ok(tickets[0].display_number.endsWith("1000"));
  let jobs=checked(await admin.from("print_jobs").select("id,status,attempt_count").eq("device_id",device.id));
  assert.equal(jobs.length,1);
  await page.reload();
  await button.waitFor({state:"visible",timeout:60000});
  assert.equal(checked(await admin.from("tickets").select("id").eq("branch_id",branch.id)).length,1);
  // This uses TEST admin cancellation to exercise the installed bridge poller.
  checked(await admin.from("tickets").update({status:"cancelled",cancelled_at:new Date().toISOString()}).eq("id",tickets[0].id));
  for(let i=0;i<20;i++){
    jobs=checked(await admin.from("print_jobs").select("id,status").eq("device_id",device.id));
    if(jobs[0].status==="cancelled") break;
    await new Promise(r=>setTimeout(r,1000));
  }
  assert.equal(jobs[0].status,"cancelled");
  await page.screenshot({path:"emulator-results/live-kiosk.png"});
  await fs.writeFile("emulator-results/live-summary.json",JSON.stringify({passed:true,checks:["installed APK WebView opened live TEST kiosk","stub issued at 1000","one ticket and one print job","reload did not duplicate ticket","cancelled ticket stopped queued print job"],hardwarePrinterVerified:false},null,2));
  console.log("PASS: native APK live kiosk, stub issuance, reload deduplication, cancellation; hardware printing remains unverified.");
} finally {
  if(browser) await browser.close();
  adb("shell","am","force-stop",pkg);
  if(branch) checked(await admin.from("branches").delete().eq("id",branch.id).eq("business_id",owner.businessId));
}
