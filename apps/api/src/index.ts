import { createApp } from './app'
import { remoteJwks } from './auth/remote-jwks'

export default createApp({ getJwks: remoteJwks })
