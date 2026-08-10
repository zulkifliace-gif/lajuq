const fs = require('fs');
let c = fs.readFileSync('fb-order-backend/server.js', 'utf8');
c = c.replace("const staffNamespace = io.of('/staff');", "");
c = c.replace("const customerNamespace = io.of('/customer');", "");
const altIdx = c.indexOf("const io = new Server(server, {") + 31;
const endOptsIdx = c.indexOf("});", altIdx) + 3;
c = c.slice(0, endOptsIdx) + "\nconst staffNamespace = io.of('/staff');\nconst customerNamespace = io.of('/customer');\n" + c.slice(endOptsIdx);
fs.writeFileSync('fb-order-backend/server.js', c);
