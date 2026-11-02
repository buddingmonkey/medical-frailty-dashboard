/** A file we cannot turn into a table. The message is shown to the admin. */
export class ParseError extends Error {
  override name = 'ParseError'
}
