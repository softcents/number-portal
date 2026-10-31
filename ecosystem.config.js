module.exports = {
  apps: [
    {
      name: 'number-portal-api',
      cwd: '/www/wwwroot/number-portal.softcents.com/backend',
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    },
    {
      name: 'number-portal-web',
      cwd: '/www/wwwroot/number-portal.softcents.com',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      instances: 1,
      autorestart: true,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
};
