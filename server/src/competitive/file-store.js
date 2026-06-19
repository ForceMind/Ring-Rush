const fs = require('fs');
const path = require('path');

class FileCompetitiveStore {
    constructor(filePath = path.resolve(__dirname, '../../data/competitive-state.json')) {
        this.filePath = filePath;
    }

    load() {
        if (!fs.existsSync(this.filePath)) {
            return null;
        }

        const content = fs.readFileSync(this.filePath, 'utf8');
        if (!content.trim()) {
            return null;
        }

        return JSON.parse(content);
    }

    save(state) {
        const dir = path.dirname(this.filePath);
        fs.mkdirSync(dir, { recursive: true });

        const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
        try {
            fs.renameSync(tmpPath, this.filePath);
        } catch (err) {
            if (process.platform !== 'win32' || err.code !== 'EPERM') {
                throw err;
            }
            if (fs.existsSync(this.filePath)) {
                fs.unlinkSync(this.filePath);
            }
            fs.renameSync(tmpPath, this.filePath);
        }
    }
}

module.exports = {
    FileCompetitiveStore
};
