import { createClientErrorHandler } from './handler.ts'

const handler = createClientErrorHandler({
  getClientKey: (request) => {
    const address = request.headers.get('cf-connecting-ip')
    return address && !address.includes(',') ? address : null
  },
  writeReport: (report) => {
    console.error(JSON.stringify({ event: 'client_error', ...report }))
  },
})

Deno.serve(handler)
