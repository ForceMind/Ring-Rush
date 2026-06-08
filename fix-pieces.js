const fs = require('fs');
let code = fs.readFileSync('src/game.js', 'utf8');

code = code.replace(/new Piece\(state/g, 'new Piece(this, state');
code = code.replace(/new Piece\(c\.x/g, 'new Piece(this, c.x');
code = code.replace(/new Piece\(x/g, 'new Piece(this, x');
code = code.replace(/new Piece\(ax/g, 'new Piece(this, ax');
code = code.replace(/new Piece\(bx/g, 'new Piece(this, bx');

fs.writeFileSync('src/game.js', code);
console.log('Fixed new Piece calls.');
