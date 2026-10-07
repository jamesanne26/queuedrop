import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth.mjs";
import { ownerCredentials, hasAdminTestEnvironment } from "../helpers/env.mjs";
import { createAdminClient, getOwnerBusiness, getCustomerSessionForTicket } from "../helpers/admin-db.mjs";
import { dismissDashboardResultModal } from "../helpers/ui.mjs";
const credentials = ownerCredentials();
const checked = result => { if(result.error) throw result.error; return result.data; };
async function fixture(page, count=7) {
  const admin = createAdminClient();
  expect(new URL(process.env.QUEUEDROP_TEST_SUPABASE_URL).hostname).toBe("tcgiwtfhqssulxwawimh.supabase.co");
  const owner = await getOwnerBusiness(admin,credentials.email);
  await loginAsOwner(page,credentials);
  const branch=checked(await admin.from("branches").insert({business_id:owner.businessId,name:"E2E TV "+crypto.randomUUID(),slug:"e2e-tv-"+crypto.randomUUID(),timezone:"Asia/Manila"}).select("id").single());
  checked(await admin.from("branch_users").insert({branch_id:branch.id,user_id:owner.userId}));
  const previousCapacity=checked(await admin.from("business_subscriptions").select("custom_max_services_per_branch,custom_max_active_queues_per_branch,override_expires_at").eq("business_id",owner.businessId).maybeSingle());
  try {
    if(count>3 && previousCapacity) checked(await admin.from("business_subscriptions").update({custom_max_services_per_branch:Math.max(count,previousCapacity.custom_max_services_per_branch??0),custom_max_active_queues_per_branch:Math.max(count,previousCapacity.custom_max_active_queues_per_branch??0),override_expires_at:null}).eq("business_id",owner.businessId));
    const services=checked(await admin.from("services").insert(Array.from({length:count},(_,index)=>({branch_id:branch.id,name:"TV Service "+(index+1),queue_prefix:"TV"+(index+1),is_active:true}))).select("id,name,is_active"));
    return {admin,owner,branch,services,cleanup:async()=>{checked(await admin.from("branches").delete().eq("id",branch.id).eq("business_id",owner.businessId));if(count>3 && previousCapacity) checked(await admin.from("business_subscriptions").update(previousCapacity).eq("business_id",owner.businessId));}};
  } catch(error) {checked(await admin.from("branches").delete().eq("id",branch.id));if(count>3 && previousCapacity) checked(await admin.from("business_subscriptions").update(previousCapacity).eq("business_id",owner.businessId));throw error;}
}
test.describe("TV display and public platform contact",()=>{
  test.skip(!credentials || !hasAdminTestEnvironment(),"Dedicated TEST credentials required.");
  test("Support matches Settings and appears above it on desktop and mobile",async({page})=>{
    await loginAsOwner(page,credentials);
    for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
      await page.setViewportSize(viewport);
      if(viewport.width<600) await page.getByRole("button",{name:"Open navigation menu"}).click();
      const support=page.locator(".sidebar-footer").getByRole("link",{name:"Support",exact:true});
      const settings=page.locator(".sidebar-footer").getByRole("link",{name:"Settings",exact:true});
      await expect(settings).toBeVisible();
      await support.click({trial:true});
      const [a,b]=await page.locator(".sidebar-footer").evaluate(footer=>["Support","Settings"].map(name=>{const link=[...footer.querySelectorAll("a")].find(a=>a.textContent.trim()===name);const r=link.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
      expect(a.y+a.height).toBeLessThanOrEqual(b.y);
      expect(Math.abs(a.x-b.x)).toBeLessThan(1);
      expect(Math.abs(a.width-b.width)).toBeLessThan(1);
      expect(await support.evaluate(el=>getComputedStyle(el).justifyContent)).toBe("flex-start");
      await expect(support).toHaveAttribute("href",/\/api\/support\/start\?from=/);
    }
  });
  test("branch TV saves service selection, fits six services and exits fullscreen on Back",async({page})=>{
    test.setTimeout(150000);
    const f=await fixture(page);
    try {
      await page.goto("/dashboard/settings?view=branch-tv&branch="+f.branch.id);
      const form=page.locator(".tv-settings-form");
      await form.locator('select[name="service_count"]').selectOption("2");
      await form.getByLabel(f.services[0].name,{exact:true}).check();
      await form.getByLabel(f.services[1].name,{exact:true}).check();
      await form.getByLabel(f.services[2].name,{exact:true}).check();
      await expect(form.getByRole("button",{name:"Save TV settings"})).toBeDisabled();
      await form.getByLabel(f.services[2].name,{exact:true}).uncheck();
      await form.getByRole("button",{name:"Save TV settings"}).click();
      await page.waitForURL(url=>url.searchParams.get("message")==="TV settings saved.");
      await dismissDashboardResultModal(page,"TV settings saved.");
      expect(checked(await f.admin.from("branch_tv_settings").select("service_count,service_ids").eq("branch_id",f.branch.id).single())).toEqual({service_count:2,service_ids:[f.services[0].id,f.services[1].id]});
      const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
      const session=checked(await f.admin.from("queue_sessions").insert({branch_id:f.branch.id,session_date:today,status:"open"}).select("id").single());
      const tickets=checked(await f.admin.from("tickets").insert(f.services.slice(0,3).map((service,index)=>({branch_id:f.branch.id,service_id:service.id,queue_session_id:session.id,ticket_number:index+1,display_number:"TV"+(index+1)+"1000",status:index===1?"called":"waiting",source:"staff"}))).select("id,display_number"));
      await page.goto("/dashboard/tv?branch="+f.branch.id);
      await expect(page.locator(".tv-service-card")).toHaveCount(2);
      await expect(page.locator(".tv-service-waiting")).toContainText([tickets[0].display_number,"—"]);
      await expect(page.locator(".tv-service-serving")).toContainText(["—",tickets[1].display_number]);
      await expect(page.locator(".tv-services-grid")).not.toContainText(tickets[2].display_number);
      checked(await f.admin.from("tickets").update({status:"cancelled"}).eq("id",tickets[0].id));
      await expect(page.locator(".tv-services-grid")).not.toContainText(tickets[0].display_number,{timeout:35000});
      // A browser policy denial must leave TV navigation and Back usable.
      await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.reject(new Error("Denied by browser"));});
      await page.getByRole("button",{name:"Fullscreen",exact:true}).click();
      await expect(page.locator(".tv-service-card")).toHaveCount(2);
      await page.getByRole("button",{name:"Back to dashboard"}).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      // Fresh navigation restores the native API; the sidebar click has real user activation.
      await page.reload();
      await page.locator("aside.sidebar").getByRole("link",{name:"TV Display",exact:true}).click();
      await expect(page).toHaveURL(/\/dashboard\/tv/);
      await expect.poll(()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);
      await page.getByLabel("TV display branch").selectOption(f.branch.id);
      await expect(page.locator(".tv-service-card")).toHaveCount(2);
      await expect.poll(()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);
      await page.getByRole("button",{name:"Back to dashboard"}).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      expect(await page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(false);
      checked(await f.admin.from("branch_tv_settings").update({service_count:6,service_ids:[]}).eq("branch_id",f.branch.id));
      await page.goto("/dashboard/tv?branch="+f.branch.id);
      await page.setViewportSize({width:1920,height:1080});
      await expect(page.locator(".tv-service-card")).toHaveCount(6);
      await expect(page.locator(".tv-service-card").first()).toBeVisible();
      await expect(page.getByLabel("Loading QueueDrop workspace")).toHaveCount(0);
      const bounds=await page.locator(".tv-service-card").evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));
      expect(bounds.every(r=>r.width>100&&r.height>100&&r.x>=0&&r.y>=0&&r.right<=1920&&r.bottom<=1080)).toBe(true);
    } finally {await f.cleanup();}
  });
  test("platform owner edits public phone, customer mobile sees it, clear hides it and non-owner cannot edit",async({page,browser,request})=>{
    test.setTimeout(120000);
    const f=await fixture(page,1);
    const previousOwner=checked(await f.admin.from("system_owners").select("is_active").eq("user_id",f.owner.userId).maybeSingle());
    const previousContact=checked(await f.admin.from("platform_public_contact").select("id,phone").eq("id",true).maybeSingle());
    let publicContext;
    try {
      checked(await f.admin.from("queue_configurations").upsert({branch_id:f.branch.id,stub_mode_enabled:true,is_active:true},{onConflict:"branch_id"}));
      checked(await f.admin.from("operating_hours").upsert(Array.from({length:7},(_,day_of_week)=>({branch_id:f.branch.id,day_of_week,is_open:true,open_time:"00:00",close_time:"00:00"})),{onConflict:"branch_id,day_of_week"}));
      const device=checked(await f.admin.from("devices").insert({branch_id:f.branch.id,name:"E2E Contact",device_type:"ticket_terminal",service_id:f.services[0].id,is_active:true}).select("device_token").single());
      await page.goto("/dashboard/settings?view=branch-terminals&branch="+f.branch.id);
      await expect(page.getByRole("button",{name:"Copy token",exact:true})).toHaveCount(1);
      await expect(page.getByRole("button",{name:"Copy URL",exact:true})).toHaveCount(0);
      const response=await request.post("/api/kiosk/"+device.device_token+"/ticket",{data:{serviceId:f.services[0].id,requestId:crypto.randomUUID()}});
      expect(response.status()).toBe(200);
      const issued=await response.json();
      const session=await getCustomerSessionForTicket(f.admin,issued.ticket_id);
      expect(session).not.toBeNull();
      checked(await f.admin.from("system_owners").upsert({user_id:f.owner.userId,is_active:true}));
      await page.goto("/system/settings");
      await page.getByLabel("Public contact number").fill("0917 123 4567");
      await page.getByRole("button",{name:"Save public contact"}).click();
      await expect(page.locator(".notice.notice-success[role=status]")).toContainText("Public contact saved.");
      publicContext=await browser.newContext({viewport:{width:390,height:844}});
      const customer=await publicContext.newPage();
      const origin=new URL(page.url()).origin;
      await customer.goto(origin+"/q/status/"+session.session_token);
      await expect(customer.getByRole("heading",{name:"Contact QueueDrop"})).toBeVisible();
      await expect(customer.locator(".customer-platform-contact a")).toHaveAttribute("href","tel:+639171234567");
      await page.getByLabel("Public contact number").fill("");
      await page.getByRole("button",{name:"Save public contact"}).click();
      await expect.poll(async()=>checked(await f.admin.from("platform_public_contact").select("phone").eq("id",true).single()).phone).toBe(null);
      await expect(page.locator(".notice.notice-success[role=status]")).toContainText("Public contact saved.");
      await customer.reload();
      await expect(customer.locator(".customer-platform-contact")).toHaveCount(0);
      checked(await f.admin.from("system_owners").update({is_active:false}).eq("user_id",f.owner.userId));
      await page.goto("/system/settings");
      await expect(page).toHaveURL(/\/dashboard$/);
    } finally {
      await publicContext?.close();
      if(previousOwner) checked(await f.admin.from("system_owners").update(previousOwner).eq("user_id",f.owner.userId));
      else checked(await f.admin.from("system_owners").delete().eq("user_id",f.owner.userId));
      if(previousContact) checked(await f.admin.from("platform_public_contact").upsert(previousContact));
      else checked(await f.admin.from("platform_public_contact").delete().eq("id",true));
      await f.cleanup();
    }
  });
});
