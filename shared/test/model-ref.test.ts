import assert from "node:assert/strict"
import test from "node:test"
import {
  findModel,
  modelRefEquals,
  modelRefKey,
  parseModelRef,
  requireModelRef
} from "../src/model-ref.ts"

test("parseModelRef accepts Hanako-style composite model refs", () => {
  assert.deepEqual(parseModelRef({ id: "deepseek-chat", provider: "deepseek" }), {
    id: "deepseek-chat",
    provider: "deepseek"
  })
  assert.deepEqual(parseModelRef("deepseek/deepseek-chat"), {
    id: "deepseek-chat",
    provider: "deepseek"
  })
  assert.deepEqual(parseModelRef("deepseek-chat"), {
    id: "deepseek-chat",
    provider: ""
  })
  assert.equal(parseModelRef(""), null)
})

test("requireModelRef rejects naked ids at runtime boundaries", () => {
  assert.deepEqual(requireModelRef("deepseek/deepseek-chat"), {
    id: "deepseek-chat",
    provider: "deepseek"
  })
  assert.throws(() => requireModelRef("deepseek-chat"), /missing id or provider/)
  assert.throws(() => requireModelRef({ id: "deepseek-chat" }), /missing id or provider/)
})

test("findModel uses provider and id as the exact model identity", () => {
  const models = [
    { id: "deepseek-chat", provider: "deepseek" },
    { id: "deepseek-chat", provider: "gateway" }
  ]

  assert.deepEqual(findModel(models, "deepseek-chat", "gateway"), models[1])
  assert.equal(findModel(models, "missing", "deepseek"), null)
  assert.throws(() => findModel(models, "deepseek-chat", ""), /id and provider both required/)
})

test("modelRefKey and modelRefEquals do not degrade to id-only matching", () => {
  assert.equal(
    modelRefKey({ id: "deepseek-chat", provider: "deepseek" }),
    "deepseek/deepseek-chat"
  )
  assert.equal(
    modelRefEquals(
      { id: "deepseek-chat", provider: "deepseek" },
      { id: "deepseek-chat", provider: "gateway" }
    ),
    false
  )
  assert.equal(
    modelRefEquals(
      { id: "deepseek-chat", provider: "deepseek" },
      { id: "deepseek-chat" }
    ),
    false
  )
})
