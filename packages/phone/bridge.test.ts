import assert from "node:assert/strict";
import test from "node:test";
import { acceptPhoneFile, bytesFromDataUrl, openPhoneSession, PHONE_BYTE_LIMIT, phoneFileName, phoneFilesSince, phoneDeliveryStatus, touchPhoneSession } from "./bridge.ts";

test("a phone file arrives only for the open QR session and keeps its name", () => {
  const session = openPhoneSession();
  const refused = acceptPhoneFile("not-a-session", { name: "photo.jpg", mimeType: "image/jpeg", bytes: Uint8Array.of(1) });
  assert.deepEqual(refused, { error: "unknown" });

  const accepted = acceptPhoneFile(session.token, {
    name: "../Камера/photo.jpg",
    mimeType: "image/jpeg",
    bytes: Uint8Array.of(9, 8, 7),
  });
  assert.equal("error" in accepted, false);
  if ("error" in accepted) return;
  assert.equal(accepted.name, "photo.jpg");

  const arrived = phoneFilesSince(session.token, 0);
  assert.equal(arrived?.length, 1);
  assert.equal(arrived?.[0]?.name, "photo.jpg");
  assert.deepEqual(arrived?.[0]?.bytes, Uint8Array.of(9, 8, 7));
  assert.equal(phoneFilesSince(session.token, accepted.id)?.length, 0);
});

test('active pairing renews its lease, acknowledged files free the queue, and expiry remains enforced',()=>{
 const session=openPhoneSession(1000),hour=3600000;
 assert.equal(touchPhoneSession(session.token,1000+11*hour),true);
 assert.deepEqual(phoneFilesSince(session.token,0,1000+13*hour),[]);
 const accepted=acceptPhoneFile(session.token,{name:'voice',mimeType:'audio/mp4',bytes:Uint8Array.of(1)},1000+14*hour);
 assert.ok('id' in accepted);assert.equal(phoneFileName('voice','audio/mp4'),'voice.m4a');
 if('id' in accepted)assert.deepEqual(phoneFilesSince(session.token,accepted.id,1000+15*hour),[]);
 assert.equal(touchPhoneSession(session.token,1000+28*hour),false);
});

test("an empty or oversized phone file stays on the phone", () => {
  const session = openPhoneSession();
  assert.equal(bytesFromDataUrl("data:image/png;base64,"), null);
  assert.deepEqual(acceptPhoneFile(session.token, { name: "empty.jpg", mimeType: "image/jpeg", bytes: new Uint8Array() }), { error: "empty" });
  assert.deepEqual(
    acceptPhoneFile(session.token, { name: "big.jpg", mimeType: "image/jpeg", bytes: new Uint8Array(PHONE_BYTE_LIMIT + 1) }),
    { error: "large" },
  );
  assert.equal(phoneFilesSince(session.token, 0)?.length, 0);
  assert.equal(phoneFileName("clip", "video/mp4"), "clip.mp4");
});

test("a closed phone session no longer lists the file", () => {
  const session = openPhoneSession(1_000);
  assert.equal(phoneFilesSince(session.token, 0, 1_000 + 12 * 60 * 60 * 1000), null);
});

test('C4 a phone upload remains pending until receiving app acknowledges a saved ID',()=>{
 const session=openPhoneSession(10000);
 const accepted=acceptPhoneFile(session.token,{name:'page.pdf',mimeType:'application/pdf',bytes:Uint8Array.of(37,80,68,70)},10100);
 assert.ok('id' in accepted);if(!('id' in accepted))return;
 assert.equal(phoneDeliveryStatus(session.token,accepted.id,10200),'pending');
 assert.equal(phoneFilesSince(session.token,0,10300)?.length,1);
 assert.equal(phoneDeliveryStatus(session.token,accepted.id,10400),'pending','Polling is not saving');
 assert.equal(phoneFilesSince(session.token,0,10500)?.length,1,'Transient receiver failure is retriable');
 assert.deepEqual(phoneFilesSince(session.token,accepted.id,10600),[]);
 assert.equal(phoneDeliveryStatus(session.token,accepted.id,10700),'delivered');
 assert.equal(phoneDeliveryStatus(session.token,accepted.id+1,10700),'unknown');
});
test('C4 retry after lost upload response is idempotent before and after receipt',()=>{
 const session=openPhoneSession(20000),requestId='12345678-1234-4123-a123-123456789abc';
 const input={name:'lab.pdf',mimeType:'application/pdf',bytes:Uint8Array.of(1,2,3),requestId};
 const first=acceptPhoneFile(session.token,input,20010),retry=acceptPhoneFile(session.token,input,20020);
 assert.deepEqual(first,retry);
 assert.equal(phoneFilesSince(session.token,0,20030)?.length,1);
 assert.deepEqual(acceptPhoneFile(session.token,{...input,bytes:Uint8Array.of(9)},20040),{error:'conflict'});
 assert.deepEqual(acceptPhoneFile(session.token,{...input,bytes:Uint8Array.of(4,5,6)},20045),{error:'conflict'},'Same-size but different bytes must not be deduplicated');
 if('id' in first){
  assert.deepEqual(phoneFilesSince(session.token,first.id,20050),[]);
  assert.deepEqual(acceptPhoneFile(session.token,input,20060),first);
  assert.equal(phoneDeliveryStatus(session.token,first.id,20070),'delivered');
 }
});
test('C4 unknown token, invalid IDs and expiry disclose no receipt state',()=>{
 const session=openPhoneSession(30000);
 const accepted=acceptPhoneFile(session.token,{name:'private.jpg',mimeType:'image/jpeg',bytes:Uint8Array.of(8)},30020);
 if(!('id' in accepted))throw Error('not accepted');
 assert.equal(phoneDeliveryStatus('different-session',accepted.id,30030),null);
 assert.equal(phoneDeliveryStatus(session.token,-1,30030),'unknown');
 assert.equal(phoneDeliveryStatus(session.token,accepted.id,30000+13*60*60*1000),null);
});
