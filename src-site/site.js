const yearNode = document.querySelector('[data-year]');
if (yearNode) {
    yearNode.textContent = String(new Date().getFullYear());
}

const healthNode = document.querySelector('[data-health-status]');
if (healthNode) {
    fetch('/api/competitive/health', { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('offline')))
        .then(() => {
            healthNode.textContent = '在线服务已准备，可以开始试玩。';
        })
        .catch(() => {
            healthNode.textContent = '在线服务正在准备中，稍后再试。';
        });
}
