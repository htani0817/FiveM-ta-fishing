// Lua の構文と、未定義のグローバル参照を調べる
const fs = require('fs');
const path = require('path');
const luaparse = require('luaparse');
const dir = process.argv[2];
const files = ['config.lua', 'shared.lua', 'server.lua', 'client.lua', 'fxmanifest.lua'];
const known = new Set(('Config Fishing lib cache exports json MySQL GlobalState source vec2 vec3 vec4 vector3 ' +
  'print pairs ipairs type tostring tonumber math table string os next select error pcall setmetatable ' +
  'CreateThread Wait GetGameTimer TriggerClientEvent TriggerEvent AddEventHandler RegisterNetEvent RegisterCommand ' +
  'GetPlayerPed GetEntityCoords GetPlayerName GetCurrentResourceName GetEntityForwardVector TestProbeAgainstWater ' +
  'CreateObject SetModelAsNoLongerNeeded AttachEntityToEntity GetPedBoneIndex TaskPlayAnim ClearPedTasks DoesEntityExist DeleteEntity ' +
  'RemoveAnimDict IsEntityDead IsPedInAnyVehicle IsPedSwimming IsPedRagdoll IsPedFalling DisableControlAction IsControlJustPressed ' +
  'PlaySoundFrontend ShakeGameplayCam GetGroundZFor_3dCoord CreatePed SetEntityInvincible SetBlockingOfNonTemporaryEvents ' +
  'SetPedFleeAttributes SetPedCanRagdoll FreezeEntityPosition TaskStartScenarioInPlace AddBlipForCoord SetBlipSprite SetBlipColour ' +
  'SetBlipScale SetBlipAsShortRange BeginTextCommandSetBlipName AddTextComponentSubstringPlayerName EndTextCommandSetBlipName ' +
  'SendNUIMessage RegisterNUICallback SetNuiFocus IsDisabledControlPressed SetTimeout ' +
  'fx_version game name description author version ui_page files shared_scripts client_script server_scripts dependencies').split(/\s+/));
let bad = 0;
for (const f of files) {
  let src = fs.readFileSync(path.join(dir, f), 'utf8');
  if (src.charCodeAt(0) === 0xfeff) { console.log(f, 'BOM あり'); bad++; }
  if (src.includes('\r')) { console.log(f, 'CR あり'); bad++; }
  src = src.replace(/`[A-Za-z0-9_]+`/g, '0'); // FiveM のハッシュ文字列
  let ast;
  try {
    ast = luaparse.parse(src, { scope: true, luaVersion: '5.3' });
  } catch (e) { console.log(f, '構文エラー', e.message); bad++; continue; }
  const globals = new Set();
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'Identifier' && n.isLocal === false && !known.has(n.name)) globals.add(n.name);
    for (const k in n) if (k !== 'type') walk(n[k]);
  })(ast.body);
  console.log(f, 'OK', globals.size ? '未知のグローバル: ' + [...globals].join(', ') : '');
}
process.exit(bad ? 1 : 0);
