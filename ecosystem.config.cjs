// PM2 ecosystem for the hashiden content-engine worker (runs on the workbox).
// Consumes the `hashiden-content-engine` BullMQ queue on the shared Valkey HA
// cluster. Off the live app boxes so ffmpeg/video work can't contend with the
// game. .env (mode 600) holds FAL/GEMINI/AWS secrets + the Valkey sentinel cfg.
const ROOT = '/home/ec2-user/hashiden-content-engine';

module.exports = {
  apps: [
    {
      name: 'hashiden-content-engine-worker',
      script: 'src/service/worker.ts',
      interpreter: `${ROOT}/node_modules/.bin/tsx`,
      cwd: ROOT,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      kill_timeout: 30000, // let in-flight jobs drain on SIGTERM
      out_file: '/home/ec2-user/.pm2/logs/content-engine.log',
      error_file: '/home/ec2-user/.pm2/logs/content-engine.err.log',
      merge_logs: true,
      time: true,
      env: {},
    },
  ],
};
