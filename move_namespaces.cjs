const fs = require('fs');
let c = fs.readFileSync('fb-order-backend/server.js', 'utf8');

// Move staffNamespace and customerNamespace to the top
const toInsert = `
const staffNamespace = io.of('/staff');
const customerNamespace = io.of('/customer');
`;

// Remove them from the bottom
c = c.replace("const staffNamespace = io.of('/staff');", "");
c = c.replace("const customerNamespace = io.of('/customer');", "");

// Insert them after io is defined
const ioDefStr = "  }
});";
const insertIdx = c.indexOf(ioDefStr) + ioDefStr.length;
if (c.indexOf(ioDefStr) !== -1) {
    c = c.slice(0, insertIdx) + "\n" + toInsert + "\n" + c.slice(insertIdx);
} else {
    // try finding just the new Server
    const altIdx = c.indexOf("const io = new Server(server, {") + 31;
    // skip to end of options
    const endOptsIdx = c.indexOf("});", altIdx) + 3;
    c = c.slice(0, endOptsIdx) + "\n" + toInsert + "\n" + c.slice(endOptsIdx);
}

fs.writeFileSync('fb-order-backend/server.js', c);
