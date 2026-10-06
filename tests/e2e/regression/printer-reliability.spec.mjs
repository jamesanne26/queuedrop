import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth.mjs";
import { ownerCredentials, hasAdminTestEnvironment } from "../helpers/env.mjs";
import { createAdminClient, getOwnerBusiness, cleanupOwnedBranch, findBranchByName, findServiceByName } from "../helpers/admin-db.mjs";
import { createBranchFromUi, createServiceFromUi, scenarioId } from "../helpers/scenario-fixtures.mjs";

const credentials = ownerCredentials();
function checked(result) { if (result.error) throw result.error; return result.data; }
async function setup(page) {
  const admin = createAdminClient();
  const owner = await getOwnerBusiness(admin, credentials.email);
  const branchName = `E2E Print ${scenarioId()}`;
  let branch;
  try {
    await loginAsOwner(page, credentials);
    await createBranchFromUi(page, branchName);
    branch = await findBranchByName(admin, owner.businessId, branchName);
    await createServiceFromUi(page, branch.id, `${branchName} Service`, {queuePrefix:"PR"});
    const service = await findServiceByName(admin, branch.id, `${branchName} Service`);
    checked(await admin.from("queue_configurations").update({stub_mode_enabled:true,is_active:true,starting_number:1000}).eq("branch_id",branch.id));
    checked(await admin.from("operating_hours").upsert(Array.from({length:7},(_,day_of_week)=>({branch_id:branch.id,day_of_week,is_open:true,open_time:"00:00",close_time:"00:00"})),{onConflict:"branch_id,day_of_week"}));
    const device=checked(await admin.from("devices").insert({branch_id:branch.id,name:branchName,device_type:"ticket_terminal",service_id:service.id,is_active:true}).select("id,device_token").single());
    return {admin,branch,service,device,cleanup:()=>cleanupOwnedBranch(admin,owner.businessId,branchName)};
  } catch(error) { await cleanupOwnedBranch(admin,owner.businessId,branchName); throw error; }
}
async function issue(request,fixture,id=crypto.randomUUID()) {
  const response=await request.post(`/api/kiosk/${fixture.device.device_token}/ticket`,{data:{serviceId:fixture.service.id,requestId:id}});
  expect(response.status()).toBe(200);return response.json();
}

test.describe("printer reliability regression",()=>{
  test.skip(!credentials || !hasAdminTestEnvironment(),"Dedicated TEST credentials required");
  test("disconnected printer stops retrying cancelled backlog and safely reprints an uncertain stub",async({page,request})=>{
    test.setTimeout(150_000);
    const f=await setup(page);
    const jobs=`/api/print-bridge/${f.device.device_token}/jobs`;
    try {
      const cancelled=await issue(request,f);
      expect(cancelled.display_number).toBe("PR1000");
      let claimed=await (await request.get(jobs)).json();
      expect(claimed.job.ticketId).toBe(cancelled.ticket_id);
      expect((await request.patch(jobs,{data:{jobId:claimed.job.jobId,success:false,error:"Printer disconnected"}})).status()).toBe(200);
      // Cancel through the real staff action/UI while hardware is disconnected.
      await page.goto(`/dashboard/queues?branch=${f.branch.id}&service=${f.service.id}`);
      const card=page.locator(".live-waiting-panel .live-ticket-card",{hasText:cancelled.display_number});
      await card.getByRole("button",{name:"Cancel",exact:true}).click();
      const dialog=page.getByRole("dialog");
      const code=(await dialog.locator(".live-confirm-code").textContent()).trim();
      await dialog.locator('input[name="confirm_code"]').fill(code);
      await dialog.locator("form.live-confirm-form").evaluate(form=>form.requestSubmit());
      await expect.poll(async()=>checked(await f.admin.from("tickets").select("status").eq("id",cancelled.ticket_id).single()).status).toBe("cancelled");
      const active=await issue(request,f);
      claimed=await (await request.get(jobs)).json();
      expect(claimed.job.ticketId).toBe(active.ticket_id);
      expect(checked(await f.admin.from("print_jobs").select("status").eq("id",cancelled.print_job_id).single()).status).toBe("cancelled");
      expect((await request.patch(jobs,{data:{jobId:cancelled.print_job_id,success:true}})).status()).toBe(409);
      checked(await f.admin.from("print_jobs").update({claimed_at:new Date(Date.now()-180_000).toISOString()}).eq("id",active.print_job_id));
      expect((await (await request.get(jobs)).json()).job).toBeNull();
      expect(checked(await f.admin.from("print_jobs").select("status").eq("id",active.print_job_id).single()).status).toBe("uncertain");
      await page.goto("/dashboard/terminals");
      const reprint=page.locator("form",{has:page.locator(`input[name="job_id"][value="${active.print_job_id}"]`)});
      await reprint.locator('input[name="checked_paper"]').check();
      await reprint.getByRole("button",{name:"Reprint same stub",exact:true}).click();
      await expect.poll(async()=>checked(await f.admin.from("print_jobs").select("status").eq("id",active.print_job_id).single()).status).toBe("pending");
      claimed=await (await request.get(jobs)).json();
      expect(claimed.job.ticketId).toBe(active.ticket_id);
      expect((await request.patch(jobs,{data:{jobId:active.print_job_id,success:true}})).status()).toBe(200);
      expect((await (await request.get(jobs)).json()).job).toBeNull();
    } finally {await f.cleanup();}
  });
  test("lost kiosk response recovers the same stub across a page reload",async({page})=>{
    test.setTimeout(120_000);
    const f=await setup(page);
    try {
      await page.goto(`/kiosk/${f.device.device_token}`);
      const endpoint=`**/api/kiosk/${f.device.device_token}/ticket`;
      let original;
      await page.route(endpoint,async route=>{
        original=await (await route.fetch()).json();
        await route.abort("failed");
      },{times:1});
      await page.getByRole("button",{name:"Press here to get stub"}).click();
      await expect(page.locator(".stub-terminal-error")).toBeVisible();
      expect(original.ticket_id).toBeTruthy();
      await page.reload();
      await page.getByRole("button",{name:"Press here to get stub"}).click();
      await expect(page.locator(".stub-terminal-success")).toContainText(original.display_number);
      expect(checked(await f.admin.from("tickets").select("id").eq("branch_id",f.branch.id))).toHaveLength(1);
      expect(checked(await f.admin.from("print_jobs").select("id").eq("device_id",f.device.id))).toHaveLength(1);
    } finally {await f.cleanup();}
  });
});
