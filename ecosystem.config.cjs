// PM2 ecosystem for the Hashiden pet-art worker.
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
      kill_timeout: 30000,
      out_file: '/home/ec2-user/.pm2/logs/content-engine.log',
      error_file: '/home/ec2-user/.pm2/logs/content-engine.err.log',
      merge_logs: true,
      time: true,
      env: {},
    },
  ],
};
