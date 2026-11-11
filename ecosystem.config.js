module.exports = {
  apps: [
    {
      name: "ai-office-panel",
      cwd: "/home/q/ai-office",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: "ai-office-bot",
      cwd: "/home/q/ai-office",
      script: "npm",
      args: "run bot",
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
