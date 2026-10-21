// The EET mock (native-e2e.md 4.4, web's e2e/support/eet.ts): two fake EET
// responders over core's `createFakeEetResponder` (production at
// /eet/services/..., the sandbox at /eet-playground/services/...), the
// generated certificates the e2e certificate picker and the official-test
// list hand out, and /__mock/eet/* controls for the flows (Maestro scripts
// call them with `http.get`; see subflows/eet-*.yaml).
import {
  createFakeEetResponder,
  type FakeEetAnswer,
  type FakeEetResponder,
} from "@payky/core/testing/eet-fake-responder"
import {
  createTestCertificate,
  createTestPkcs12,
} from "@payky/core/testing/eet-test-certificates"
import type { MockHandler } from "./mock-handler.ts"

const certificatePassword = "generated-e2e-password"
const day = 24 * 60 * 60 * 1000

type Connection = "answering" | "refusing" | "hanging"

interface State {
  production: FakeEetResponder
  playground: FakeEetResponder
  connection: Connection
  unanswered: number
  officialAvailable: boolean
}

const newState = async (): Promise<State> => ({
  production: await createFakeEetResponder({ test: false }),
  playground: await createFakeEetResponder({ test: true }),
  connection: "answering",
  unanswered: 0,
  officialAvailable: true,
})

let state = await newState()

const certificates = new Map<string, Promise<Uint8Array>>()
/** A taxpayer certificate for `eic`, as web's `createEetCertificateFile`. */
const certificateFile = (eic: string): Promise<Uint8Array> => {
  const cached = certificates.get(eic)
  if (cached !== undefined) return cached
  const created = (async () => {
    const certificate = await createTestCertificate({
      subject: { commonName: eic, description: "generated e2e taxpayer" },
      validFrom: new Date(Date.now() - day),
      validTo: new Date(Date.now() + 365 * day),
    })
    return await createTestPkcs12({
      ...certificate,
      password: certificatePassword,
    })
  })()
  certificates.set(eic, created)
  return created
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const respond = async (request: Request, responder: FakeEetResponder) => {
  if (state.connection === "refusing")
    return new Response("unavailable", { status: 503 })
  if (state.connection === "hanging") {
    state.unanswered += 1
    return await new Promise<Response>(() => undefined)
  }
  const response = await responder.fetch(request.url, {
    method: "POST",
    headers: { "content-type": "text/xml; charset=utf-8" },
    body: await request.text(),
  })
  const headers = new Headers(response.headers)
  headers.set("access-control-expose-headers", "x-global-transaction-id")
  return new Response(await response.text(), {
    status: response.status,
    headers,
  })
}

/**
 * `GET /__mock/eet/expect?env=production&payment=&count=&amounts=&first=&pokl=`:
 * waits (up to `timeout` ms) until the requests of `env` — only those whose
 * `porad_cis` is `payment`, when given — match every given condition, then
 * answers 200; 408 with what it saw otherwise. Web's `expect.poll`.
 */
const expectRequests = async (url: URL): Promise<Response> => {
  const query = url.searchParams
  const responder =
    query.get("env") === "playground" ? state.playground : state.production
  const matching = () => {
    const payment = query.get("payment")
    const requests = responder.requests.filter(
      ({ data }) => payment === null || data.porad_cis === payment
    )
    const count = query.get("count")
    const amounts = query.get("amounts")
    const first = query.get("first")
    const pokl = query.get("pokl")
    return {
      requests,
      ok:
        (count === null || requests.length === Number(count)) &&
        (amounts === null ||
          requests.map(({ data }) => data.celk_trzba).join(",") === amounts) &&
        (first === null ||
          requests.every(({ header }) => header.prvni_zaslani === first)) &&
        (pokl === null || requests.every(({ data }) => data.id_pokl === pokl)),
    }
  }
  const deadline = Date.now() + Number(query.get("timeout") ?? 20_000)
  while (!matching().ok && Date.now() < deadline) await sleep(250)
  const { requests, ok } = matching()
  return Response.json(
    { ok, seen: requests.map(({ header, data }) => ({ ...header, ...data })) },
    { status: ok ? 200 : 408 }
  )
}

const control = async (url: URL): Promise<Response> => {
  const query = url.searchParams
  switch (url.pathname) {
    case "/__mock/eet/reset":
      state = await newState()
      return new Response("ok")
    case "/__mock/eet/connection":
      state.connection = query.get("mode") as Connection
      return new Response("ok")
    case "/__mock/eet/official":
      state.officialAvailable = query.get("available") !== "false"
      return new Response("ok")
    case "/__mock/eet/answer-next":
      state.production.answerNext(
        JSON.parse(query.get("answer") ?? "{}") as FakeEetAnswer
      )
      return new Response("ok")
    case "/__mock/eet/expect":
      return await expectRequests(url)
    case "/__mock/eet/unanswered":
      return Response.json({
        ok: state.unanswered > 0,
        count: state.unanswered,
      })
    default:
      return new Response("no such control", { status: 404 })
  }
}

export const eetMock: MockHandler = async (request, url) => {
  if (url.pathname.startsWith("/__mock/eet/")) return await control(url)
  if (request.method === "POST" && url.pathname.startsWith("/eet/services/"))
    return await respond(request, state.production)
  if (
    request.method === "POST" &&
    url.pathname.startsWith("/eet-playground/services/")
  )
    return await respond(request, state.playground)
  if (url.pathname === "/eet/test-certificate.p12")
    return new Response(await certificateFile("CZ1234567890"), {
      headers: { "content-type": "application/x-pkcs12" },
    })
  if (url.pathname === "/api/eet/playground-certificates") {
    if (!state.officialAvailable)
      return Response.json(
        { status: "ERROR", reason: "unavailable" },
        { status: 502 }
      )
    return Response.json({
      password: certificatePassword,
      certificates: [
        {
          fileName: "CZ9876543210.p12",
          p12Base64: Buffer.from(
            await certificateFile("CZ9876543210")
          ).toString("base64"),
        },
      ],
    })
  }
  return undefined
}
