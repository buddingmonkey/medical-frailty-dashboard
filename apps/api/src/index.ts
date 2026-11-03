import { createApp } from './app'
import { remoteJwks } from './auth/remote-jwks'
import { CRON_ACTOR, runMaintenance } from './maintenance/maintenance'

const app = createApp({ getJwks: remoteJwks })

export default {
  fetch: app.fetch,
  // The weekly Cron Trigger (wrangler.jsonc, "triggers"): backups and draft cleanup
  // (docs/deployment.md, "Backups and restore").
  scheduled(controller, env, ctx) {
    ctx.waitUntil(
      runMaintenance(env, {
        trigger: 'cron',
        actor: CRON_ACTOR,
        now: new Date(controller.scheduledTime),
      }),
    )
  },
} satisfies ExportedHandler<Env>
