module.exports = {
  apps: [
    {
      name: 'number-portal.softcents.com',
      script: 'server.js',
      cwd: '/www/wwwroot/number-portal.softcents.com',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    }
  ]
};
