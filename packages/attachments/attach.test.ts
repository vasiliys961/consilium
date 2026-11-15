import assert from "node:assert/strict";
import test from "node:test";
import { attachEquipment } from "./attach.ts";

const base = { caseId: "case-1", locale: "en" as const, draft: "Unsigned draft." };

test("the protocol attachment returns the note and the next attachment stays unbuilt", () => {
  const protocol = attachEquipment({ ...base, name: "protocol", speech: "metoprolol 50 mg" });
  assert.equal(protocol.status, "read");
  assert.equal(protocol.visit?.diagnosed, false);
  assert.match(protocol.visit?.text ?? "", /metoprolol 50 mg/);

  const next = attachEquipment({ ...base, name: "next" });
  assert.equal(next.status, "not_assessed");
  assert.equal(next.reason, "not built");
  assert.equal(next.visit, null);

  const unknown = attachEquipment({ ...base, name: "billing" });
  assert.equal(unknown.status, "not_assessed");
  assert.equal(unknown.reason, "not registered");
  assert.equal(unknown.visit, null);
});
