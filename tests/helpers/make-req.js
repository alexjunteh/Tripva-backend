import express from 'express'
import supertest from 'supertest'

/**
 * Wraps a Vercel-style handler with an express app + supertest client.
 * Uses express.json() so req.body is populated for most handlers.
 */
export function makeReq(handler) {
  const app = express()
  app.use(express.json())
  app.all('*', (req, res) => handler(req, res))
  return supertest(app)
}

/**
 * Same but without body parsing — required for handlers that read the raw
 * stream themselves (stripe.js uses manual async-iteration for HMAC).
 */
export function makeRawReq(handler) {
  const app = express()
  app.all('*', (req, res) => handler(req, res))
  return supertest(app)
}
