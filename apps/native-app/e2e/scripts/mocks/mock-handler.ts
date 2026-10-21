/**
 * One outside service's mock: answers the requests it owns and returns
 * `undefined` for the rest, so mock-server.ts tries the next one.
 */
export type MockHandler = (
  request: Request,
  url: URL
) => Response | undefined | Promise<Response | undefined>
