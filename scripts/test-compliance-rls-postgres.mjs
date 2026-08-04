import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const execFileAsync=promisify(execFile);
const dockerCommand=process.platform==="win32"?"docker.exe":"docker";
const quoteIdentifier=(value)=>`"${value.replaceAll('"','""')}"`;
const requiredConfirmation="isolated-only";
const managementUrlValue=process.env.PJSKTOOLS_POSTGRES_TEST_URL;
if(!managementUrlValue){
  throw new Error("PJSKTOOLS_POSTGRES_TEST_URL is required and must point to an isolated cluster management database");
}
if(process.env.PJSKTOOLS_ALLOW_DESTRUCTIVE_POSTGRES_TESTS!==requiredConfirmation){
  throw new Error(`PJSKTOOLS_ALLOW_DESTRUCTIVE_POSTGRES_TESTS must equal ${requiredConfirmation}`);
}
if(process.env.NODE_ENV==="production"){
  throw new Error("destructive PostgreSQL integration tests are forbidden when NODE_ENV=production");
}
const marker=process.env.PJSKTOOLS_POSTGRES_TEST_MARKER??"";
if(!/^[a-zA-Z0-9_]{12,24}$/.test(marker)){
  throw new Error("PJSKTOOLS_POSTGRES_TEST_MARKER must be a unique 12-24 character alphanumeric/underscore marker");
}
const managementUrl=new URL(managementUrlValue);
if(managementUrl.search!==""||managementUrl.hash!==""){
  throw new Error("PJSKTOOLS_POSTGRES_TEST_URL must not contain query parameters or a fragment");
}
const managementDatabase=decodeURIComponent(managementUrl.pathname.slice(1));
const normalizedHost=managementUrl.hostname.toLowerCase().replace(/^\[|\]$/g,"");
const loopbackHosts=new Set(["localhost","127.0.0.1","::1"]);
const forbiddenHosts=new Set(["101.35.21.48","sekai-tools.cn","api.sekai-tools.cn","www.sekai-tools.cn"]);
if(forbiddenHosts.has(normalizedHost)||normalizedHost.endsWith(".sekai-tools.cn")){
  throw new Error("known production PostgreSQL hosts are forbidden");
}
if(managementDatabase.toLowerCase()!=="postgres"){
  throw new Error("PJSKTOOLS_POSTGRES_TEST_URL must target only the postgres management database");
}
if(/sekai|pjsktools|prod/i.test(managementDatabase)){
  throw new Error("production-like database names are forbidden");
}
if(!loopbackHosts.has(normalizedHost)){
  if(process.env.PJSKTOOLS_ALLOW_NON_LOOPBACK_POSTGRES_TESTS!=="isolated-ci-cluster"||
     process.env.PJSKTOOLS_CONFIRM_EPHEMERAL_POSTGRES_CLUSTER!=="yes-drop-databases-and-roles"){
    throw new Error("non-loopback test clusters require both isolated CI cluster confirmations");
  }
}
const controlPool=new Pool({connectionString:managementUrl.toString(),max:1,idleTimeoutMillis:0});
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const safeMarker=marker.toLowerCase();
const testDatabase=`codex_rls_test_${safeMarker}_${suffix}`;
const adminUrl=new URL(managementUrl);
adminUrl.pathname=`/${testDatabase}`;
const runtimeRole = `pjsktools_rls_runtime_${suffix}`;
const authRuntimeRole = `pjsktools_rls_auth_${suffix}`;
const complianceRuntimeRole = `pjsktools_rls_compliance_${suffix}`;
const harukiRuntimeRole = `pjsktools_rls_haruki_${suffix}`;
const migrationRole = `pjsktools_rls_migration_${suffix}`;
const anonymousRole = `pjsktools_rls_anon_${suffix}`;
const rollbackFunction = `pjsktools_rls_fail_delete_${suffix}`;
const rollbackTrigger = `pjsktools_rls_fail_delete_trigger_${suffix}`;
const oauthRollbackFunction = `pjsktools_rls_fail_oauth_${suffix}`;
const oauthRollbackTrigger = `pjsktools_rls_fail_oauth_trigger_${suffix}`;
const runtimePassword = randomBytes(24).toString("hex");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = runtimeRole;
runtimeUrl.password = runtimePassword;
const authRuntimeUrl = new URL(adminUrl);
authRuntimeUrl.username = authRuntimeRole;
authRuntimeUrl.password = runtimePassword;
const complianceRuntimeUrl = new URL(adminUrl);
complianceRuntimeUrl.username = complianceRuntimeRole;
complianceRuntimeUrl.password = runtimePassword;
const harukiRuntimeUrl = new URL(adminUrl);
harukiRuntimeUrl.username = harukiRuntimeRole;
harukiRuntimeUrl.password = runtimePassword;
const migrationUrl=new URL(adminUrl);
migrationUrl.username=migrationRole;
migrationUrl.password=runtimePassword;
const bootstrapAdminUrl=new URL(adminUrl);
if(process.platform==="win32"){
  // A Docker Desktop sibling container reaches the Windows host through this
  // stable gateway name; 127.0.0.1 would point back to the client container.
  bootstrapAdminUrl.hostname="host.docker.internal";
}
function dockerReachableUrl(sourceUrl){
  const value=new URL(sourceUrl);
  if(process.platform==="win32") value.hostname="host.docker.internal";
  return value.toString();
}
let runtimePool;
let authRuntimePool;
let complianceRuntimePool;
let harukiRuntimePool;
let migrationPool;
let adminPool;
let store;
let userA;
let userB;
let rollbackUser;
let isolatedDatabaseCreated=false;
let isolatedRolePreflightPassed=false;
let migrationsStarted=false;
const bootstrapTempDirectory=path.resolve(`.runtime-bootstrap-${safeMarker}-${suffix}`);
const fixedMigrationRoles=[
  "pjsktools_compliance_owner","pjsktools_compliance_user","pjsktools_compliance_maintenance",
  "pjsktools_account_deletion_executor","pjsktools_auth_api","pjsktools_auth_executor",
  "pjsktools_app_user","pjsktools_ranking_service","pjsktools_idempotency_service",
  "pjsktools_haruki_user","pjsktools_haruki_worker"
];

async function runBootstrap(harukiPassword) {
  await mkdir(bootstrapTempDirectory,{recursive:true});
  const bashEnvironment={
    NODE_ENV:"production",
    DATABASE_ROLE_CONFIG_SOURCE:"environment",
    DATABASE_ROLE_BOOTSTRAP_CONFIRMATION:"migrations-complete-runtime-logins-only",
    POSTGRES_ADMIN_URL:bootstrapAdminUrl.toString(),
    APP_RUNTIME_ROLE:runtimeRole,
    APP_RUNTIME_PASSWORD:runtimePassword,
    AUTH_RUNTIME_ROLE:authRuntimeRole,
    AUTH_RUNTIME_PASSWORD:runtimePassword,
    COMPLIANCE_RUNTIME_ROLE:complianceRuntimeRole,
    COMPLIANCE_RUNTIME_PASSWORD:runtimePassword,
    HARUKI_RUNTIME_ROLE:harukiRuntimeRole,
    HARUKI_RUNTIME_PASSWORD:harukiPassword,
    DATABASE_URL:dockerReachableUrl(runtimeUrl),
    AUTH_DATABASE_URL:dockerReachableUrl(authRuntimeUrl),
    COMPLIANCE_DATABASE_URL:dockerReachableUrl(complianceRuntimeUrl)
  };
  const args=["run","--rm","--network","host","--user","0:0","--mount",`type=bind,source=${path.resolve("deploy/compliance/bootstrap-database-roles.sh")},target=/bootstrap.sh,readonly`];
  for(const [key,value] of Object.entries(bashEnvironment)){args.push("--env",`${key}=${value}`);}
  args.push("postgres:16","bash","/bootstrap.sh");
  await execFileAsync(dockerCommand,args,{cwd:process.cwd(),env:process.env});
}

async function runPreMigrationBootstrap() {
  await mkdir(bootstrapTempDirectory,{recursive:true});
  const bashEnvironment={
    NODE_ENV:"test",
    DATABASE_ROLE_TEST_MODE:"true",
    DATABASE_ROLE_TEST_CONFIRMATION:"isolated-harness-only",
    DATABASE_ROLE_BOOTSTRAP_CONFIRMATION:"pre-migration-fixed-roles-only",
    POSTGRES_ADMIN_URL:bootstrapAdminUrl.toString(),
    DATABASE_MIGRATION_URL:dockerReachableUrl(migrationUrl),
    DATABASE_MIGRATION_ROLE:migrationRole,
    DATABASE_MIGRATION_PASSWORD:runtimePassword,
    APP_RUNTIME_ROLE:runtimeRole,
    AUTH_RUNTIME_ROLE:authRuntimeRole,
    COMPLIANCE_RUNTIME_ROLE:complianceRuntimeRole
  };
  const args=["run","--rm","--network","host","--user","0:0","--mount",`type=bind,source=${path.resolve("deploy/compliance/bootstrap-pre-migration-roles.sh")},target=/bootstrap.sh,readonly`];
  for(const [key,value] of Object.entries(bashEnvironment)){args.push("--env",`${key}=${value}`);}
  args.push("postgres:16","bash","/bootstrap.sh");
  await execFileAsync(dockerCommand,args,{cwd:process.cwd(),env:process.env});
}

async function applyMigrationsTwice() {
  const migrationsDirectory = path.resolve("apps", "api", "src", "db", "migrations");
  const migrationFiles = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
  assert.ok(migrationFiles.some((file) => file.startsWith("014_")));
  assert.ok(migrationFiles.some((file) => file.startsWith("016_")));
  assert.ok(migrationFiles.some((file) => file.startsWith("018_")));
  for (let pass = 1; pass <= 2; pass += 1) {
    await runPreMigrationBootstrap();
    for (const file of migrationFiles) {
      const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
      try {
        await migrationPool.query(sql);
      } catch (error) {
        error.message = `${file} (pass ${pass}): ${error.message}`;
        throw error;
      }
    }
  }
  return migrationFiles;
}

async function inPoolRole(pool, role, userId, operation) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    if (userId !== undefined) {
      await client.query(`select set_config('pjsktools.user_id', $1, true)`, [userId]);
    }
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function inRuntimeRole(role, userId, operation) {
  return inPoolRole(runtimePool, role, userId, operation);
}

async function expectRejected(operation, expectedCode = "42501") {
  await assert.rejects(operation, (error) => error?.code === expectedCode);
}

let rejectionSavepointCounter=0;
async function expectRejectedInTransaction(client, operation, expectedCode="42501") {
  const savepoint=`expected_rejection_${++rejectionSavepointCounter}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    await assert.rejects(operation, (error)=>error?.code===expectedCode);
  } finally {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
  }
}

try {
  const controlIdentity=await controlPool.query(`select current_user,
    (select rolsuper from pg_roles where rolname=current_user) as is_superuser`);
  assert.equal(controlIdentity.rows[0].is_superuser,true,"isolated cluster management URL must use a superuser");
  const existingDatabases=await controlPool.query(`select datname from pg_database
    where datallowconn and not datistemplate order by datname`);
  assert.deepEqual(existingDatabases.rows.map(row=>row.datname),[managementDatabase],
    "the destructive role test requires an exclusive cluster with no other connectable databases");
  const existingPjsktoolsRoles=await controlPool.query(`select rolname from pg_roles where rolname ~ '^pjsktools_' order by rolname`);
  assert.equal(existingPjsktoolsRoles.rowCount,0,"pre-existing pjsktools_* roles found; refusing to touch this cluster");
  await controlPool.query(`select pg_advisory_lock(731402916, 194827331)`);
  const lockedDatabases=await controlPool.query(`select datname from pg_database
    where datallowconn and not datistemplate order by datname`);
  assert.deepEqual(lockedDatabases.rows.map(row=>row.datname),[managementDatabase],
    "the isolated cluster changed while waiting for the destructive-test lock");
  const lockedPjsktoolsRoles=await controlPool.query(`select rolname from pg_roles where rolname ~ '^pjsktools_' order by rolname`);
  assert.equal(lockedPjsktoolsRoles.rowCount,0,"pjsktools_* roles appeared while waiting for the destructive-test lock");
  isolatedRolePreflightPassed=true;
  await controlPool.query(`create database ${quoteIdentifier(testDatabase)} with template template0 encoding 'UTF8'`);
  isolatedDatabaseCreated=true;
  adminPool=new Pool({connectionString:adminUrl.toString()});
  await adminPool.query(`create extension if not exists pgcrypto`);
  const admin = await adminPool.query(
    `select current_user,
      (select rolsuper from pg_roles where rolname = current_user) as is_superuser,
      (select rolcreaterole from pg_roles where rolname = current_user) as can_create_role,
      (select rolbypassrls from pg_roles where rolname = current_user) as bypass_rls`
  );
  assert.equal(admin.rowCount, 1);
  assert.equal(admin.rows[0].is_superuser, true, "isolated migration test requires an admin role");
  assert.equal(admin.rows[0].can_create_role, true, "isolated migration test requires CREATEROLE");
  await runPreMigrationBootstrap();
  await controlPool.query(`grant create on database ${quoteIdentifier(testDatabase)} to ${migrationRole}`);
  migrationPool=new Pool({connectionString:migrationUrl.toString()});
  migrationsStarted=true;
  const migrationFiles = await applyMigrationsTwice();
  const migrationIdentity=await migrationPool.query(`select rolsuper,rolcreaterole,rolinherit from pg_roles where rolname=current_user`);
  assert.deepEqual(migrationIdentity.rows[0],{rolsuper:false,rolcreaterole:false,rolinherit:true});
  const migrationMemberships=await migrationPool.query(`select parent.rolname from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles member on member.oid=m.member where member.rolname=current_user order by parent.rolname`);
  assert.deepEqual(migrationMemberships.rows.map(row=>row.rolname),['pjsktools_account_deletion_executor','pjsktools_auth_executor','pjsktools_compliance_owner']);
  assert.equal((await migrationPool.query(`select has_table_privilege(current_user,'users','SELECT') as allowed`)).rows[0].allowed,true,"migration owner membership must permit future ALTER/inspection through the owner role");
  await migrationPool.query(`alter table users add column if not exists migration_owner_probe_${suffix} boolean`);
  await migrationPool.query(`alter table users drop column if exists migration_owner_probe_${suffix}`);

  const roleProperties = await adminPool.query(
    `select rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolinherit, rolbypassrls
     from pg_roles where rolname in (
       'pjsktools_compliance_owner', 'pjsktools_compliance_user',
       'pjsktools_compliance_maintenance', 'pjsktools_account_deletion_executor',
       'pjsktools_auth_api','pjsktools_auth_executor','pjsktools_app_user',
       'pjsktools_ranking_service','pjsktools_idempotency_service',
       'pjsktools_haruki_user','pjsktools_haruki_worker'
     ) order by rolname`
  );
  assert.equal(roleProperties.rowCount, 11);
  for (const role of roleProperties.rows) {
    assert.equal(role.rolcanlogin, false);
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolcreaterole, false);
    assert.equal(role.rolcreatedb, false);
    assert.equal(role.rolinherit, false);
    assert.equal(role.rolbypassrls, false);
  }
  const tableOwners = await adminPool.query(
    `select tablename, tableowner from pg_tables
     where schemaname = 'public' and tablename in (
       'legal_acceptances', 'account_deletion_intents',
       'account_deletion_tombstones', 'ranking_history_minute_rollups'
     ) order by tablename`
  );
  assert.equal(tableOwners.rowCount, 4);
  assert.ok(tableOwners.rows.every((table) => table.tableowner === "pjsktools_compliance_owner"));
  const publicPrivileges=await adminPool.query(`select has_schema_privilege('public','public','CREATE') as schema_create, has_function_privilege('public','public.pjsktools_delete_account_with_tombstone(uuid,text,text)','EXECUTE') as delete_execute`);
  assert.equal(publicPrivileges.rows[0].schema_create,false);
  assert.equal(publicPrivileges.rows[0].delete_execute,false);
  const ownerMembership=await adminPool.query(`select pg_has_role(current_user,'pjsktools_compliance_owner','MEMBER') as owner_member`);
  assert.equal(ownerMembership.rows[0].owner_member,true);
  const authFunctions=await adminPool.query(`select p.proname,r.rolname as owner,p.prosecdef,p.proconfig
    from pg_proc p join pg_roles r on r.oid=p.proowner join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'pjsktools_auth_%'`);
  assert.equal(authFunctions.rowCount,22);
  for(const fn of authFunctions.rows){
    assert.equal(fn.owner,'pjsktools_auth_executor');
    assert.equal(fn.prosecdef,true);
    assert.ok(fn.proconfig.includes('search_path=pg_catalog'));
    assert.ok(fn.proconfig.includes('row_security=on'));
  }
  const publicAuthExecute=await adminPool.query(`select bool_or(has_function_privilege('public',p.oid,'EXECUTE')) as allowed
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pjsktools_auth_%'`);
  assert.equal(publicAuthExecute.rows[0].allowed,false);

  await runBootstrap("");
  await runBootstrap("");
  const disabledHaruki=await adminPool.query(`select rolcanlogin,rolpassword is null as password_cleared from pg_authid where rolname=$1`,[harukiRuntimeRole]);
  assert.equal(disabledHaruki.rowCount,0,"fresh disabled bootstrap must not create a Haruki LOGIN");
  await runBootstrap(runtimePassword);
  await adminPool.query(`grant pjsktools_compliance_user to ${runtimeRole}`);
  await adminPool.query(`grant pjsktools_app_user to ${authRuntimeRole}`);
  await adminPool.query(`grant pjsktools_auth_api to ${complianceRuntimeRole}`);
  await adminPool.query(`grant pjsktools_auth_api to ${harukiRuntimeRole}`);
  await runBootstrap(runtimePassword);
  const exactMemberships=async(role,expected)=>{
    const result=await adminPool.query(`select parent.rolname from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles member on member.oid=m.member where member.rolname=$1 order by parent.rolname`,[role]);
    assert.deepEqual(result.rows.map(row=>row.rolname),expected);
  };
  await exactMemberships(runtimeRole,['pjsktools_app_user','pjsktools_idempotency_service','pjsktools_ranking_service']);
  await exactMemberships(authRuntimeRole,['pjsktools_auth_api']);
  await exactMemberships(complianceRuntimeRole,['pjsktools_compliance_maintenance','pjsktools_compliance_user']);
  await exactMemberships(harukiRuntimeRole,['pjsktools_haruki_user','pjsktools_haruki_worker']);
  await runBootstrap("");
  const disabledExistingHaruki=await adminPool.query(`select rolcanlogin,rolpassword is null as password_cleared from pg_authid where rolname=$1`,[harukiRuntimeRole]);
  assert.deepEqual(disabledExistingHaruki.rows[0],{rolcanlogin:false,password_cleared:true});
  await exactMemberships(harukiRuntimeRole,[]);
  await runBootstrap(runtimePassword);
  await exactMemberships(harukiRuntimeRole,['pjsktools_haruki_user','pjsktools_haruki_worker']);
  runtimePool = new Pool({ connectionString: runtimeUrl.toString() });
  authRuntimePool = new Pool({ connectionString: authRuntimeUrl.toString() });
  complianceRuntimePool = new Pool({ connectionString: complianceRuntimeUrl.toString() });
  harukiRuntimePool = new Pool({ connectionString: harukiRuntimeUrl.toString() });
  const runtimeIdentity = await runtimePool.query(
    `select current_user, rolsuper, rolcreaterole, rolcreatedb, rolinherit, rolbypassrls
     from pg_roles where rolname = current_user`
  );
  assert.deepEqual(runtimeIdentity.rows[0], {
    current_user: runtimeRole,
    rolsuper: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolinherit: false,
    rolbypassrls: false
  });

  await expectRejected(() => runtimePool.query(`select * from legal_acceptances`));
  await runtimePool.query(`select set_config('pjsktools.email','victim@example.invalid',false)`);
  await runtimePool.query(`select set_config('pjsktools.user_id',$1,false)`,[randomUUID()]);
  await runtimePool.query(`select set_config('pjsktools.refresh_token_hash','forged',false)`);
  for(const table of ['users','oauth_accounts','auth_sessions','auth_states','email_verification_codes','email_verification_cooldowns','oauth_handoffs']){
    await expectRejected(()=>runtimePool.query(`select * from ${table}`));
  }
  await expectRejected(() => runtimePool.query(`select * from public.pjsktools_auth_get_password('victim@example.invalid')`));
  await inRuntimeRole("pjsktools_app_user",randomUUID(),async(client)=>{
    await client.query(`select set_config('pjsktools.email','victim@example.invalid',true)`);
    await client.query(`select set_config('pjsktools.oauth_identity','qq:victim',true)`);
    await client.query(`select set_config('pjsktools.session_id',$1,true)`,[randomUUID()]);
    for(const table of ['users','oauth_accounts','auth_sessions']){
      await expectRejectedInTransaction(client,()=>client.query(`select * from ${table}`));
      await expectRejectedInTransaction(client,()=>client.query(`delete from ${table}`));
    }
    await expectRejectedInTransaction(client,()=>client.query(`insert into users(email) values('forged@example.invalid')`));
    await expectRejectedInTransaction(client,()=>client.query(`update users set nickname='forged'`));
    await expectRejectedInTransaction(client,()=>client.query(`insert into oauth_accounts(user_id,provider,provider_user_id) values($1,'qq','forged')`,[randomUUID()]));
    await expectRejectedInTransaction(client,()=>client.query(`update oauth_accounts set nickname='forged'`));
    await expectRejectedInTransaction(client,()=>client.query(`insert into auth_sessions(user_id,refresh_token_hash,expires_at) values($1,'forged',now()+interval '1 hour')`,[randomUUID()]));
    await expectRejectedInTransaction(client,()=>client.query(`update auth_sessions set revoked_at=now()`));
  });

  await expectRejected(()=>authRuntimePool.query(`select * from public.pjsktools_auth_get_password('victim@example.invalid')`));
  await expectRejected(()=>authRuntimePool.query(`set role pjsktools_auth_executor`));
  await inPoolRole(authRuntimePool,"pjsktools_auth_api",undefined,async(client)=>{
    for(const table of ['users','oauth_accounts','auth_sessions','auth_states','email_verification_codes','email_verification_cooldowns','oauth_handoffs']){
      await expectRejectedInTransaction(client,()=>client.query(`select * from ${table}`));
      await expectRejectedInTransaction(client,()=>client.query(`delete from ${table}`));
    }
    await expectRejectedInTransaction(client,()=>client.query(`set local role pjsktools_auth_executor`));
  });

  const concurrentEmail=`rls-code-${suffix}@example.invalid`;
  const concurrentCode='472913';
  const bcrypt=(await import('bcryptjs')).default;
  const concurrentCodeHash=await bcrypt.hash(concurrentCode,10);
  await inPoolRole(authRuntimePool,"pjsktools_auth_api",undefined,(client)=>client.query(
    `select * from public.pjsktools_auth_create_email_code($1,'register',$2,now()+interval '5 minutes')`,
    [concurrentEmail,concurrentCodeHash]
  ));
  const codeResults=await Promise.all(Array.from({length:8},()=>inPoolRole(
    authRuntimePool,"pjsktools_auth_api",undefined,async(client)=>{
      const locked=await client.query(`select * from public.pjsktools_auth_lock_email_code($1,'register')`,[concurrentEmail]);
      if(!locked.rows[0]) return false;
      const success=await bcrypt.compare(concurrentCode,locked.rows[0].code_hash);
      const finished=await client.query(`select public.pjsktools_auth_finish_email_code($1,$2,'register',$3) as consumed`,[locked.rows[0].id,concurrentEmail,success]);
      return finished.rows[0].consumed;
    }
  )));
  assert.equal(codeResults.filter(Boolean).length,1,"email verification code must be consumed exactly once");

  await inPoolRole(harukiRuntimePool,"pjsktools_haruki_user",undefined,async(client)=>{
    await client.query(`select set_config('pjsktools.haruki_worker','true',true)`);
    await expectRejectedInTransaction(client,()=>client.query(`select * from haruki_webhook_events`));
  });
  await inPoolRole(harukiRuntimePool,"pjsktools_haruki_worker",undefined,(client)=>
    client.query(`select count(*) from haruki_webhook_events`)
  );
  await expectRejected(() =>
    runtimePool.query(
      `insert into account_deletion_tombstones (user_hash, deleted_at) values ($1, now())`,
      [`base-runtime-${suffix}`]
    )
  );

  const users = await adminPool.query(
    `insert into users (email) values ($1), ($2), ($3) returning id`,
    [
      `rls-a-${suffix}@example.invalid`,
      `rls-b-${suffix}@example.invalid`,
      `rls-rollback-${suffix}@example.invalid`
    ]
  );
  [userA, userB, rollbackUser] = users.rows.map((row) => row.id);
  await adminPool.query(
    `insert into api_idempotency_records
      (scope, idempotency_key, request_hash, status_code, response_body, expires_at)
     values ($1, 'rls-test', 'request-a', 200, '{}'::jsonb, now() + interval '1 hour'),
            ($2, 'rls-test', 'request-b', 200, '{}'::jsonb, now() + interval '1 hour')`,
    [`${userA}:delete`, `${userB}:delete`]
  );

  await inPoolRole(complianceRuntimePool,"pjsktools_compliance_user", userA, async (client) => {
    await client.query(
      `insert into legal_acceptances
        (user_id, privacy_version, terms_version, age_confirmed, source)
       values ($1, 'rls-test', 'rls-test', true, 'web')`,
      [userA]
    );
    await client.query(
      `insert into account_deletion_intents (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '10 minutes')`,
      [userA, `token-a-${suffix}`]
    );
    const own = await client.query(`select user_id from legal_acceptances`);
    assert.deepEqual(own.rows.map((row) => row.user_id), [userA]);
    const crossUser = await client.query(`select user_id from legal_acceptances where user_id = $1`, [userB]);
    assert.equal(crossUser.rowCount, 0);
    const consumed = await client.query(
      `update account_deletion_intents set consumed_at = now() where user_id = $1 returning id`,
      [userA]
    );
    assert.equal(consumed.rowCount, 1);
  });

  await inPoolRole(complianceRuntimePool,"pjsktools_compliance_user", userB, (client) =>
    client.query(
      `insert into account_deletion_intents (user_id, token_hash, expires_at)
       values ($1, $2, now() - interval '1 minute')`,
      [userB, `expired-token-${suffix}`]
    )
  );
  await expectRejected(() =>
    inPoolRole(complianceRuntimePool,"pjsktools_compliance_user", userA, (client) =>
      client.query(
        `insert into legal_acceptances
          (user_id, privacy_version, terms_version, age_confirmed, source)
         values ($1, 'cross-user', 'cross-user', true, 'web')`,
        [userB]
      )
    )
  );
  const tombstonesBeforeCrossDelete = await adminPool.query(
    `select count(*)::int as count from account_deletion_tombstones`
  );
  await expectRejected(() =>
    inPoolRole(complianceRuntimePool,"pjsktools_compliance_user", userA, (client) =>
      client.query(`select * from public.pjsktools_lock_account_deletion_identity($1)`, [userB])
    )
  );
  await expectRejected(() =>
    inPoolRole(complianceRuntimePool,"pjsktools_compliance_user", userA, (client) =>
      client.query(`select public.pjsktools_delete_account_with_tombstone($1, $2, $3)`, [
        userB,
        `cross-user-${suffix}`,
        null
      ])
    )
  );
  const crossDeleteState = await adminPool.query(
    `select
      (select count(*)::int from users where id = $1) as users,
      (select count(*)::int from account_deletion_tombstones) as tombstones,
      (select count(*)::int from api_idempotency_records where scope = $2) as idempotency`,
    [userB, `${userB}:delete`]
  );
  assert.equal(crossDeleteState.rows[0].users, 1);
  assert.equal(crossDeleteState.rows[0].tombstones, tombstonesBeforeCrossDelete.rows[0].count);
  assert.equal(crossDeleteState.rows[0].idempotency, 1);

  for (const wrongIdentity of [undefined, "", "not-a-uuid", userB]) {
    await inPoolRole(complianceRuntimePool,"pjsktools_compliance_user", wrongIdentity, async (client) => {
      const hidden = await client.query(`select id from legal_acceptances where user_id = $1`, [userA]);
      assert.equal(hidden.rowCount, 0);
    });
  }

  await inPoolRole(adminPool, "pjsktools_compliance_owner", userA, async (client) => {
    const ownerBypassBlocked = await client.query(`select id from legal_acceptances`);
    assert.equal(ownerBypassBlocked.rowCount, 0);
  });

  await adminPool.query(`create role ${anonymousRole} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls`);
  await adminPool.query(`grant usage on schema public to ${anonymousRole}`);
  await adminPool.query(
    `grant select, insert, update, delete on legal_acceptances, account_deletion_intents,
      account_deletion_tombstones, ranking_history_minute_rollups to ${anonymousRole}`
  );
  await inPoolRole(adminPool, anonymousRole, userA, async (client) => {
    for (const table of [
      "legal_acceptances",
      "account_deletion_intents",
      "account_deletion_tombstones",
      "ranking_history_minute_rollups"
    ]) {
      const hidden = await client.query(`select * from ${table}`);
      assert.equal(hidden.rowCount, 0);
    }
  });

  await inPoolRole(complianceRuntimePool,"pjsktools_compliance_maintenance", undefined, async (client) => {
    const visibleExpiredIntents = await client.query(`select expires_at, consumed_at from account_deletion_intents`);
    assert.equal(visibleExpiredIntents.rowCount, 1);
    const deletedExpiredIntents = await client.query(`delete from account_deletion_intents where expires_at <= now()`);
    assert.equal(deletedExpiredIntents.rowCount, 1);
    await client.query(
      `insert into account_deletion_tombstones (user_hash, deleted_at)
       values ($1, now()), ($2, now() - interval '201 days')`,
      [`fresh-${suffix}`, `expired-${suffix}`]
    );
    const freshDelete = await client.query(`delete from account_deletion_tombstones where user_hash = $1`, [
      `fresh-${suffix}`
    ]);
    assert.equal(freshDelete.rowCount, 0);
    const expiredDelete = await client.query(`delete from account_deletion_tombstones where user_hash = $1`, [
      `expired-${suffix}`
    ]);
    assert.equal(expiredDelete.rowCount, 1);
    await client.query(
      `insert into ranking_history_minute_rollups
        (region, event_id, sample_type, rank, minute_at, score_min, score_max, score_avg, sample_count)
       values ('jp', $1, 'border', 100, date_trunc('minute', now()), 1, 2, 2, 1)
       on conflict (region, event_id, sample_type, rank, minute_at)
       do update set sample_count = excluded.sample_count`,
      [`rls-${suffix}`]
    );
  });
  await expectRejected(() =>
    inPoolRole(complianceRuntimePool,"pjsktools_compliance_maintenance", undefined, (client) => client.query(`select * from legal_acceptances`))
  );
  await expectRejected(() =>
    inPoolRole(complianceRuntimePool,"pjsktools_compliance_maintenance", undefined, (client) =>
      client.query(`select * from public.pjsktools_lock_account_deletion_identity($1)`, [userB])
    )
  );

  process.env.PJSKTOOLS_FORCE_MEMORY_STORE = "true";
  process.env.DELETION_TOMBSTONE_KEY = "rls-test-deletion-key-at-least-32-characters";
  const { PgStore } = await import("../apps/api/dist/pgStore.js");
  store = new PgStore(runtimeUrl.toString(), complianceRuntimeUrl.toString(), authRuntimeUrl.toString());
  await store.assertRuntimeRoleSafety();
  const handoffUser=await store.createOAuthUser({
    provider:"qq",
    providerUserId:`handoff-user-${suffix}`,
    nickname:"PostgreSQL handoff integration"
  });
  const linkedOAuth={provider:"qq",providerUserId:`handoff-link-${suffix}`};
  const deleteHandoff=`delete_${randomUUID().replaceAll("-","")}`;
  await store.createOAuthHandoff(
    deleteHandoff,
    {kind:"delete",userId:handoffUser.id,oauth:linkedOAuth},
    new Date(Date.now()+120_000).toISOString()
  );
  const handoffConsumers=await Promise.all(Array.from({length:8},()=>
    store.consumeOAuthHandoff(deleteHandoff,"delete",handoffUser.id)
  ));
  assert.equal(handoffConsumers.filter(Boolean).length,1,"OAuth handoff must be consumed exactly once");
  assert.deepEqual(
    handoffConsumers.find(Boolean),
    {kind:"delete",userId:handoffUser.id,oauth:linkedOAuth}
  );
  const expiredHandoff=`delete_${randomUUID().replaceAll("-","")}`;
  await store.createOAuthHandoff(
    expiredHandoff,
    {kind:"delete",userId:handoffUser.id,oauth:linkedOAuth},
    new Date(Date.now()-1_000).toISOString()
  );
  assert.equal(await store.consumeOAuthHandoff(expiredHandoff,"delete",handoffUser.id),null);
  const authState=`state_${randomUUID()}`;
  await store.createAuthState("qq",authState,"/account",new Date(Date.now()+120_000).toISOString());
  const authStateConsumers=await Promise.all(Array.from({length:8},()=>store.consumeAuthState("qq",authState)));
  assert.equal(authStateConsumers.filter(Boolean).length,1,"OAuth state must be consumed exactly once");
  const consumedAuthState=authStateConsumers.find(Boolean);
  assert.equal(consumedAuthState.provider,"qq");
  assert.equal(consumedAuthState.state,authState);
  assert.equal(consumedAuthState.redirectTo,"/account");
  assert.equal(consumedAuthState.ageConfirmed,false);
  assert.equal(consumedAuthState.privacyVersion,undefined);
  assert.equal(consumedAuthState.termsVersion,undefined);
  assert.ok(consumedAuthState.id);
  assert.ok(Date.parse(consumedAuthState.createdAt));
  assert.ok(Date.parse(consumedAuthState.expiresAt));
  const conflictingOAuthIdentity=`rollback-${suffix}`;
  await adminPool.query(`create function public.${oauthRollbackFunction}() returns trigger language plpgsql as $$ begin if new.provider_user_id='${conflictingOAuthIdentity}' then raise exception 'intentional oauth rollback test'; end if; return new; end $$`);
  await adminPool.query(`create trigger ${oauthRollbackTrigger} before insert on oauth_accounts for each row execute function public.${oauthRollbackFunction}()`);
  const usersBeforeOAuthFailure=await adminPool.query(`select count(*)::int as count from users`);
  await assert.rejects(()=>store.createOAuthUser({provider:'qq',providerUserId:conflictingOAuthIdentity}),/intentional oauth rollback test/);
  const usersAfterOAuthFailure=await adminPool.query(`select count(*)::int as count from users`);
  assert.equal(usersAfterOAuthFailure.rows[0].count,usersBeforeOAuthFailure.rows[0].count,"OAuth link failure must roll back user insertion");
  const tombstonesBeforeDelete = await adminPool.query(`select count(*)::int as count from account_deletion_tombstones`);
  const deletionExecutorPrivileges=await adminPool.query(`select
    has_table_privilege('pjsktools_account_deletion_executor','users','SELECT') as users_select,
    has_table_privilege('pjsktools_account_deletion_executor','users','DELETE') as users_delete,
    has_column_privilege('pjsktools_account_deletion_executor','users','id','UPDATE') as users_id_update,
    has_schema_privilege('pjsktools_account_deletion_executor','public','USAGE') as schema_usage`);
  assert.deepEqual(deletionExecutorPrivileges.rows[0],{users_select:true,users_delete:true,users_id_update:true,schema_usage:true});
  const deletionFunctionOwner=await adminPool.query(`select r.rolname as owner, p.prosecdef as security_definer
    from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid='public.pjsktools_lock_account_deletion_identity(uuid)'::regprocedure`);
  assert.deepEqual(deletionFunctionOwner.rows[0],{owner:'pjsktools_account_deletion_executor',security_definer:true});
  assert.equal(await store.deleteUserById(userA), true);
  const successfulDelete = await adminPool.query(
    `select
      (select count(*)::int from users where id = $1) as users,
      (select count(*)::int from account_deletion_tombstones) as tombstones,
      (select count(*)::int from api_idempotency_records where scope = $2) as idempotency`,
    [userA, `${userA}:delete`]
  );
  assert.equal(successfulDelete.rows[0].users, 0);
  assert.equal(successfulDelete.rows[0].tombstones, tombstonesBeforeDelete.rows[0].count + 1);
  assert.equal(successfulDelete.rows[0].idempotency, 0);

  await adminPool.query(
    `create function public.${rollbackFunction}() returns trigger language plpgsql as $$
       begin raise exception 'intentional deletion rollback test'; end
     $$`
  );
  await adminPool.query(
    `create trigger ${rollbackTrigger} before delete on users
     for each row when (old.id = '${rollbackUser}'::uuid) execute function public.${rollbackFunction}()`
  );
  const tombstonesBeforeRollback = await adminPool.query(`select count(*)::int as count from account_deletion_tombstones`);
  await assert.rejects(() => store.deleteUserById(rollbackUser), /intentional deletion rollback test/);
  const rolledBack = await adminPool.query(
    `select
      (select count(*)::int from users where id = $1) as users,
      (select count(*)::int from account_deletion_tombstones) as tombstones`,
    [rollbackUser]
  );
  assert.equal(rolledBack.rows[0].users, 1);
  assert.equal(rolledBack.rows[0].tombstones, tombstonesBeforeRollback.rows[0].count);

  console.log(
    JSON.stringify({
      result: "PASS",
      migrationAdmin: admin.rows[0].current_user,
      migrationPasses: 2,
      migrationFiles: migrationFiles.length,
      runtimeLogin: runtimeRole,
      assertions: [
        "all forward migrations apply twice",
        "runtime LOGIN is NOSUPERUSER NOBYPASSRLS NOINHERIT",
        "base runtime has no direct compliance-table access",
        "runtime user's own rows allowed and cross-user rows denied",
        "cross-user account deletion function calls denied without tombstones",
        "missing, malformed and anonymous identities denied",
        "NOLOGIN table owner cannot bypass FORCE RLS",
        "maintenance role restricted to retention windows",
        "OAuth handoff and state concurrent consumption is exactly once",
        "PgStore account deletion and tombstone are atomic",
        "PgStore account deletion rolls back on failure"
      ]
    })
  );
} finally {
  const cleanupErrors=[];
  const cleanup=async(label,operation)=>{
    try{ await operation(); }
    catch(error){ cleanupErrors.push(new Error(`${label}: ${error instanceof Error?error.message:String(error)}`)); }
  };
  // Pool clients can receive the expected administrator-termination event
  // while the isolated database is being removed. Keep it from surfacing as
  // an unhandled EventEmitter error during cleanup.
  for(const pool of [runtimePool,authRuntimePool,complianceRuntimePool,harukiRuntimePool,migrationPool,adminPool]){
    pool?.on("error",()=>undefined);
  }
  await cleanup("close PgStore pools",()=>store?.close());
  await cleanup("close runtime pool",()=>runtimePool?.end());
  await cleanup("close auth runtime pool",()=>authRuntimePool?.end());
  await cleanup("close compliance runtime pool",()=>complianceRuntimePool?.end());
  await cleanup("close Haruki runtime pool",()=>harukiRuntimePool?.end());
  await cleanup("close migration pool",()=>migrationPool?.end());
  await cleanup("close admin pool",()=>adminPool?.end());
  if(isolatedDatabaseCreated){
    await cleanup("drop isolated database",()=>controlPool.query(
      `drop database if exists ${quoteIdentifier(testDatabase)} with (force)`
    ));
  }
  if(isolatedRolePreflightPassed){
    const cleanupRoles=[
      runtimeRole,authRuntimeRole,complianceRuntimeRole,harukiRuntimeRole,migrationRole,anonymousRole,
      ...(migrationsStarted?fixedMigrationRoles:[])
    ];
    const memberships=await controlPool.query(`select parent.rolname as parent_role,member.rolname as member_role
      from pg_auth_members m
      join pg_roles parent on parent.oid=m.roleid
      join pg_roles member on member.oid=m.member
      where parent.rolname=any($1::text[]) or member.rolname=any($1::text[])`,[cleanupRoles]).catch(error=>{
        cleanupErrors.push(new Error(`inspect role memberships: ${error instanceof Error?error.message:String(error)}`));
        return {rows:[]};
      });
    for(const membership of memberships.rows){
      await cleanup(`revoke ${membership.parent_role} from ${membership.member_role}`,()=>controlPool.query(
        `revoke ${quoteIdentifier(membership.parent_role)} from ${quoteIdentifier(membership.member_role)}`
      ));
    }
    for(const role of cleanupRoles){
      await cleanup(`drop test role ${role}`,()=>controlPool.query(`drop role if exists ${quoteIdentifier(role)}`));
    }
  }
  await rm(bootstrapTempDirectory,{recursive:true,force:true}).catch(()=>undefined);
  await controlPool.query(`select pg_advisory_unlock(731402916, 194827331)`).catch(()=>undefined);
  await controlPool.end();
  if(cleanupErrors.length>0){
    throw new AggregateError(cleanupErrors,"isolated PostgreSQL test cleanup was incomplete");
  }
}
