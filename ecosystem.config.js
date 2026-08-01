module.exports = {
  apps: [
    {
      name: 'codehistory-web',
      script: 'node_modules/next/dist/bin/next',
      interpreter: 'node',
      args: 'dev',
      cwd: './',
      watch: false,
      env: {
        NODE_ENV: 'development'
      }
    },
    {
      name: 'codehistory-telegram-bot',
      script: './scripts/telegram-meta-ai-bot.js',
      cwd: './',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development'
      },
      error_file: './bot_err.log',
      out_file: './bot.log'
    }
  ]
};
