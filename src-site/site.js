const yearNode = document.querySelector('[data-year]');
if (yearNode) {
    yearNode.textContent = String(new Date().getFullYear());
}

const healthNode = document.querySelector('[data-health-status]');
if (healthNode) {
    fetch('/api/competitive/health', { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('offline')))
        .then((payload) => {
            const table = payload.tables?.[0];
            healthNode.textContent = table
                ? `服务器在线：${table.stake} 金币入场，赢家 ${table.winnerPayout} 金币`
                : '服务器在线';
        })
        .catch(() => {
            healthNode.textContent = '服务器未连接，部署后自动显示状态';
        });
}
