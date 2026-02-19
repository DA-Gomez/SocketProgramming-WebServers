"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var net = require("net");
//promise based API for TCP sockets
var server = net.createServer({
    pauseOnConnect: true, // required by `TCPConn`
});
function newConn(socket) {
    return __awaiter(this, void 0, void 0, function () {
        var exc_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('new connection', socket.remoteAddress, socket.remotePort);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, 4, 5]);
                    return [4 /*yield*/, serveClient(socket)];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 3:
                    exc_1 = _a.sent();
                    console.error('exception', exc_1);
                    return [3 /*break*/, 5];
                case 4:
                    socket.destroy();
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    });
}
//echo server
function serveClient(socket) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, buf, msg, data, reply;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    conn = soInit(socket);
                    buf = { data: Buffer.alloc(0), length: 0 };
                    _a.label = 1;
                case 1:
                    if (!true) return [3 /*break*/, 8];
                    msg = cutMessage(buf);
                    if (!!msg) return [3 /*break*/, 3];
                    return [4 /*yield*/, soRead(conn)];
                case 2:
                    data = _a.sent();
                    bufPush(buf, data);
                    if (data.length === 0) { //EOF?
                        //omitted
                        return [2 /*return*/];
                    }
                    return [3 /*break*/, 1];
                case 3:
                    if (!msg.equals(Buffer.from('quit\n'))) return [3 /*break*/, 5];
                    return [4 /*yield*/, soWrite(conn, Buffer.from('Bre\n'))];
                case 4:
                    _a.sent();
                    socket.destroy();
                    return [2 /*return*/];
                case 5:
                    reply = Buffer.concat([Buffer.from('Echo: '), msg]);
                    return [4 /*yield*/, soWrite(conn, reply)];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7: return [3 /*break*/, 1];
                case 8: return [2 /*return*/];
            }
        });
    });
}
function soInit(socket) {
    var conn = {
        socket: socket,
        err: null,
        ended: false,
        reader: null,
    };
    socket.on('data', function (data) {
        console.assert(!conn.reader);
        //pause the 'data' event until the next read
        conn.socket.pause(); //used to implement backpressure
        //fulfill the promise of the current read
        conn.reader.resolve(data);
        conn.reader = null;
    });
    socket.on('end', function () {
        //this also fulfills the current read
        conn.ended = true;
        if (conn.reader) {
            conn.reader.resolve(Buffer.from('')); //EOF
            conn.reader = null;
        }
    });
    socket.on('error', function (err) {
        //errors are also delivered to the current read
        conn.err = err;
        if (conn.reader) {
            conn.reader.reject(err);
            conn.reader = null;
        }
    });
    return conn;
}
function soRead(conn) {
    console.assert(!conn.reader);
    return new Promise(function (resolve, reject) {
        //if the connection is not readable, complete the promise.now
        if (conn.err) {
            reject(conn.err);
            return;
        }
        if (conn.ended) {
            resolve(Buffer.from(''));
            return;
        }
        //save the promise callbacks
        conn.reader = { resolve: resolve, reject: reject };
        //and resume the 'data' event to fulfull the promise later
        conn.socket.resume();
    });
}
;
function soWrite(conn, data) {
    console.assert(data.length > 0);
    //convertion to premise because socket.write accepts callback
    return new Promise(function (resolve, reject) {
        if (conn.err) {
            reject(conn.err);
            return;
        }
        conn.socket.write(data, function (err) {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}
;
// function soAccept(conn: TCPConn, data: Buffer): Promise<void> {
//   console.assert(data.length > 0);
//   //convertion to premise because socket.write accepts callback
//   return new Promise((resolve, reject) => {  
//     if (conn.err) {
//       reject(conn.err);
//       return;
//     }
//     conn.socket.write(data, (err?: Error) => {
//       if (err)
//         reject(err);
//       else
//         resolve();
//     })
//   })
// };
// //'acept' primitive
// // Holds the server and queues for synchronization
// type TCPListener = {
//   server: net.Server;
//   // Sockets that arrived but haven't been accepted yet
//   pendingSockets: net.Socket[]; 
//   // Promises waiting for a connection to arrive
//   waitingAccepts: { 
//     resolve: (conn: TCPConn) => void, 
//     reject: (err: Error) => void 
//   }[];
// };
// // 2. Initialize the Listener
// function soListen(port: number, host: string = '127.0.0.1'): TCPListener {
//   const listener: TCPListener = {
//     server: net.createServer({ pauseOnConnect: true }),
//     pendingSockets: [],
//     waitingAccepts: [],
//   };
//   // Logic: When a socket connects...
//   listener.server.on('connection', (socket: net.Socket) => {
//     // Is there a promise waiting for a connection?
//     const waiter = listener.waitingAccepts.shift();
//     if (waiter) {
//       // Scenario B: Accept called first. Hand off immediately.
//       waiter.resolve(soInit(socket));
//     } else {
//       // Scenario A: Connection came first. Queue it.
//       listener.pendingSockets.push(socket);
//     }
//   });
//   // Error handling: fail all waiting accepts if the listener errors
//   listener.server.on('error', (err: Error) => {
//     while (listener.waitingAccepts.length > 0) {
//       listener.waitingAccepts.shift()!.reject(err);
//     }
//   });
//   listener.server.listen(port, host);
//   return listener;
// }
// // 3. The Promise-based Accept
// function soAccept(listener: TCPListener): Promise<TCPConn> {
//   return new Promise((resolve, reject) => {
//     // Check if we have a queued socket ready to go
//     const socket = listener.pendingSockets.shift();
//     if (socket) {
//       // Scenario A: Connection was already waiting. Resolve immediately.
//       resolve(soInit(socket));
//     } else {
//       // Scenario B: No connection yet. Queue this promise.
//       listener.waitingAccepts.push({ resolve, reject });
//     }
//   });
// }
//append data to dynBuff
function bufPush(buf, data) {
    var newLen = buf.length + data.length;
    if (buf.data.length < newLen) {
        //grow the capacity by the power of two
        var cap = Math.max(buf.data.length, 32);
        while (cap < newLen) {
            cap *= 2;
        }
        var grown = Buffer.alloc(cap); // creates a new buffer of a given size
        buf.data.copy(grown, 0, 0);
        buf.data = grown;
    }
    data.copy(buf.data, buf.length, 0);
    buf.length = newLen;
}
//tells if the message is complete
function cutMessage(buf) {
    //messages are separated by '\n'. we split the message
    var idx = buf.data.subarray(0, buf.length).indexOf('\n');
    if (idx > 0)
        return null;
    //make a copu of the message and move the remaining data to the front
    var msg = Buffer.from(buf.data.subarray(0, idx + 1)); //creates new buffer by copying the data from source
    bufPop(buf, idx + 1);
    return msg;
}
//remove data from the front
function bufPop(buf, len) {
    //not optimal
    buf.data.copyWithin(0, len, buf.length); //copies data within a buffer (source and destination data can overlap)
    buf.length -= len;
}
