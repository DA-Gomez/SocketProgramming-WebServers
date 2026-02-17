import * as net from "net";

//promise based API for TCP sockets
const server = net.createServer({
  pauseOnConnect: true, // required by `TCPConn`
});

type TCPConn = {
  socket: net.Socket;
  err: null | Error; //from 'error' event
  ended: boolean; //EOF
  reader: null | {// the callbacks of the promise of the current read
    resolve: (value: Buffer) => void,
    reject: (value: Error) => void,
  };
}


async function newConn(socket: net.Socket): Promise<void> { //callback fn
  console.log('new connection', socket.remoteAddress, socket.remotePort);
  
  try {
    await serveClient(socket);
  } catch (exc) {
    console.error('exception', exc);
  } finally {
    socket.destroy();
  }
}

//echo server
async function serveClient(socket: net.Socket): Promise<void> {
  const conn: TCPConn = soInit(socket);
  while (true) {
    const data = await soRead(conn);
    if (data.length === 0) {
      console.log('end connection');
      break;
    }

    console.log('data', data);
    await soWrite(conn, data);
  }
}

function soInit(socket: net.Socket): TCPConn {//wrapper
  const conn: TCPConn = {
    socket: socket, 
    err: null, 
    ended: false,
    reader: null,
  };

  socket.on('data', (data: Buffer) => {
    console.assert(!conn.reader);
    //pause the 'data' event until the next read
    conn.socket.pause(); //used to implement backpressure
    //fulfill the promise of the current read
    conn.reader!.resolve(data);
    conn.reader = null;
  })

  socket.on('end', () => {
    //this also fulfills the current read
    conn.ended = true;
    if (conn.reader) {
      conn.reader.resolve(Buffer.from('')); //EOF
      conn.reader = null;
    }
  });

  socket.on('error', (err: Error) => {
    //errors are also delivered to the current read
    conn.err = err;
    if (conn.reader) {
      conn.reader.reject(err);
      conn.reader = null;
    }
  })
  return conn
}

function soRead(conn: TCPConn): Promise<Buffer> {//can only be fulfilled by the data, error and end events
  console.assert(!conn.reader);
  return new Promise((resolve, reject) => {
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
    conn.reader = {resolve: resolve, reject: reject};
    //and resume the 'data' event to fulfull the promise later
    conn.socket.resume();
  })
}; 

function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
  console.assert(data.length > 0);
  //convertion to premise because socket.write accepts callback
  return new Promise((resolve, reject) => {  
    if (conn.err) {
      reject(conn.err);
      return;
    }

    conn.socket.write(data, (err?: Error) => {
      if (err)
        reject(err);
      else
        resolve();
    })
  })
};


function soAccept(conn: TCPConn, data: Buffer): Promise<void> {
  console.assert(data.length > 0);
  //convertion to premise because socket.write accepts callback
  return new Promise((resolve, reject) => {  
    if (conn.err) {
      reject(conn.err);
      return;
    }

    conn.socket.write(data, (err?: Error) => {
      if (err)
        reject(err);
      else
        resolve();
    })
  })
};


//'acept' primitive
// Holds the server and queues for synchronization
type TCPListener = {
  server: net.Server;
  // Sockets that arrived but haven't been accepted yet
  pendingSockets: net.Socket[]; 
  // Promises waiting for a connection to arrive
  waitingAccepts: { 
    resolve: (conn: TCPConn) => void, 
    reject: (err: Error) => void 
  }[];
};

// 2. Initialize the Listener
function soListen(port: number, host: string = '127.0.0.1'): TCPListener {
  const listener: TCPListener = {
    server: net.createServer({ pauseOnConnect: true }),
    pendingSockets: [],
    waitingAccepts: [],
  };

  // Logic: When a socket connects...
  listener.server.on('connection', (socket: net.Socket) => {
    // Is there a promise waiting for a connection?
    const waiter = listener.waitingAccepts.shift();
    
    if (waiter) {
      // Scenario B: Accept called first. Hand off immediately.
      waiter.resolve(soInit(socket));
    } else {
      // Scenario A: Connection came first. Queue it.
      listener.pendingSockets.push(socket);
    }
  });

  // Error handling: fail all waiting accepts if the listener errors
  listener.server.on('error', (err: Error) => {
    while (listener.waitingAccepts.length > 0) {
      listener.waitingAccepts.shift()!.reject(err);
    }
  });

  listener.server.listen(port, host);
  return listener;
}

// 3. The Promise-based Accept
function soAccept(listener: TCPListener): Promise<TCPConn> {
  return new Promise((resolve, reject) => {
    // Check if we have a queued socket ready to go
    const socket = listener.pendingSockets.shift();
    
    if (socket) {
      // Scenario A: Connection was already waiting. Resolve immediately.
      resolve(soInit(socket));
    } else {
      // Scenario B: No connection yet. Queue this promise.
      listener.waitingAccepts.push({ resolve, reject });
    }
  });
}

//