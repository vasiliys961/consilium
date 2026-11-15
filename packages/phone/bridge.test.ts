import assert from "node:assert/strict";
import test from "node:test";
import { acceptPhoneFile, bytesFromDataUrl, openPhoneSession, PHONE_BYTE_LIMIT, phoneFileName, phoneFilesSince, touchPhoneSession } from "./bridge.ts";

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
