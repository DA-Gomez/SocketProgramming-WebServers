import * as net from "net";

const kMaxHeaderLen = 1024 * 8;

const server = net.createServer({
  pauseOnConnect: true, 
});

server.on('error', (err: Error) => { throw err; });
server.on('connection', newConn);
server.listen({host: '127.0.0.1', port: 1234}, () => {
    console.log('Server listening on 127.0.0.1:1234');
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

type DynBuf = {
  data: Buffer,
  length: number,
}

type HTTPReq = {
  method: string,
  uri: Buffer,
  version: string,
  headers: Buffer[],
}
type HTTPRes = {
  code: number,
  headers: Buffer[],
  body: BodyReader,
}

//interface for reading data from the body payload
type BodyReader = {
  length: number, //-1 if unknown
  //function allows to read arbitrarily long payload bodies
  read: () => Promise<Buffer>, //returs empty buffer after EOF
}

class HTTPError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = 'HTTPError';
  }
}

async function newConn(socket: net.Socket): Promise<void> { 
  const conn: TCPConn = soInit(socket);
  
  try {
    await serveClient(conn);
  } catch (exc) {
    console.error('exception', exc);
    
    if (exc instanceof HTTPError) {
      const resp: HTTPRes = {
        code: exc.code,
        headers: [],
        body: readerFromMemory(Buffer.from(exc.message + '\n')),
      };
      try {
        await writeHTTPResp(conn, resp);
      } catch (exc) {}
    }
  } finally {
    socket.end();
  }
}

//server loop
async function serveClient(conn: TCPConn): Promise<void> {
  const buf: DynBuf = {data: Buffer.alloc(0), length: 0}

  while (true) {
    //try to get 1 request header fron the buffer
    const msg: null | HTTPReq = cutMessage(buf);
    if (!msg) {
      const data = await soRead(conn);
      bufPush(buf, data);
      
      if (data.length === 0 && buf.length === 0) {
        return;
      }
      if (data.length === 0) {
        throw new HTTPError(400, "Unexpected EOF");//probably a bad idea in production
      }
      continue;
    }

    //process message and send response
    const reqBody: BodyReader = readerFromReq(conn, buf, msg);
    const res: HTTPRes = await handleReq(msg, reqBody);
    await writeHTTPResp(conn, res);

    //close the connection for HTTP/1.0
    if (msg.version === '1.0') {
      return;
    }
    //makes sure all the request body is processed
    while ((await reqBody.read()).length > 0) {

    }
  }  
}

//parse and remove a header from the beginning of the buffer if possible
function cutMessage(buf: DynBuf): null | HTTPReq {
  //end of header is marked by '\r\n\r\n'
  const idx = buf.data.subarray(0, buf.length).indexOf('\r\n\r\n');
  if (idx < 0) {
    if (buf.length >= kMaxHeaderLen) {
      throw new HTTPError(413, 'header too large');
    }
    return null; //need more data
  }
  //parse and remove the header
  const msg = parseHTTPReq(buf.data.subarray(0, idx + 4));
  bufPop(buf, idx + 4);
  return msg;
}

//parse the header
function parseHTTPReq(data: Buffer): HTTPReq {
  //split the data into lines
  const lines: Buffer[] = splitLines(data);
  //first line is "METHOD URI VERSION"
  const [method, uri, version] = parseRequestLine(lines[0]);
  //then header fields in the format of 'Name: value'
  const headers: Buffer[] = [];
  for (let i = 1; i < lines.length - 1; i++) {
    const h = Buffer.from(lines[i]);
    if (h.length === 0) break;
    if (!validateHeader(h)) {
      throw new HTTPError(400, 'bad field');
    }
    headers.push(h);
  }
  //header ends by empty line
  console.assert(lines[lines.length - 1].length === 0);
  return { method: method, uri: uri, version: version, headers: headers }
}

//read the body (there are 3 ways, remember) 
function readerFromReq(conn: TCPConn, buf: DynBuf, req: HTTPReq) {
  let bodyLen = -1;
  const contentLen = fieldGet(req.headers, "Content-Length");
  if (contentLen) {
    bodyLen = parseDec(contentLen.toString('latin1'));
    if (isNaN(bodyLen)) {
      throw new HTTPError(400, 'bad Content-Length');
    }
  }
  const bodyAllowed = !(req.method === 'GET' || req.method === 'HEAD');
  const chunked = fieldGet(req.headers, 'Transfer-Encoding')?.equals(Buffer.from('chunked')) || false;
  if (!bodyAllowed && (bodyLen > 0 || chunked)) {
    throw new HTTPError(400, 'HTTP body not allowed');
  }
  if (!bodyAllowed) {
    bodyLen = 0;
  }

  if (bodyLen >= 0) {
    //'Content-Lenght' is present
    return readerFromConnLength(conn, buf, bodyLen);
  } else if (chunked) {
    //chunked encoding
    throw new HTTPError(501, 'TODO');
  }
  else {
    //read the rest of the connection
    throw new HTTPError(501, 'TODO');
  }
}

//looks up an HTTP header value by name
function fieldGet(headers: Buffer[], key: string): null | Buffer {
  const lowerKey = key.toLowerCase();
  
  for (const h of headers) {
    const colonIdx = h.indexOf(':'.charCodeAt(0));
    if (colonIdx > 0) {
      const currentKey = h.subarray(0, colonIdx).toString('latin1').trim().toLowerCase();
      if (currentKey === lowerKey) {
        // Return the value part, trimmed of leading/trailing whitespace
        return Buffer.from(h.subarray(colonIdx + 1).toString('latin1').trim(), 'latin1');
      }
    }
  }
  return null;
}
// Helper to safely parse strings into decimal numbers for Content-Length
function parseDec(s: string): number {
  return parseInt(s, 10);
}

//returns body reader that reads the number of bytes specified in the Content-Length field
function readerFromConnLength(conn: TCPConn, buf: DynBuf, remain: number): BodyReader {
  return {
    length: remain,
    read: async (): Promise<Buffer> => {
      if (remain === 0) {
        return Buffer.from('');//done
      }
      if (buf.length === 0) {
        //try to get some data if there is none
        const data = await soRead(conn);
        bufPush(buf, data);
        if (data.length === 0) {
          //expect more data
          throw new Error('Unexpected EOF from HTTP body');
        }
      }
      //consume data from the buffer
      const consume = Math.min(buf.length, remain);
      remain -= consume;
      const data = Buffer.from(buf.data.subarray(0, consume));
      bufPop(buf, consume);
      return data;
    }
  }
}

//request handler
async function handleReq(req: HTTPReq, body: BodyReader): Promise<HTTPRes> {
  //act on the request URI
  let resp: BodyReader;
  switch (req.uri.toString('latin1')) {
    case '/echo':
      resp = body;
      break
    default: 
      resp = readerFromMemory(Buffer.from('hello world\n'));
      break
  }

  return {
    code: 200,
    headers: [Buffer.from('Server: my_first_http_server')],
    body: resp,
  }
}

//bodyReader from in-memory data
function readerFromMemory(data: Buffer): BodyReader {
  let done = false;
  return {
    length: data.length,
    //returns the full data on the first call and return EOF after taht
    read: async (): Promise<Buffer> => {
      if (done) {
        return Buffer.from(''); //no more data
      } else {
        done = true;
        return data;
      }
    }
  }
}

//send an HTTP respoonse through the socket 
async function writeHTTPResp(conn: TCPConn, resp: HTTPRes): Promise<void> {
  if (resp.body.length < 0) {
    throw new Error('TODO: chunked encoding');
  }

  //set the "Content-Length" field, payload body of unknown len
  console.assert(!fieldGet(resp.headers, 'Content-length'));
  resp.headers.push(Buffer.from(`Content-Length: ${resp.body.length}`));
  //write header
  await soWrite(conn, encodeHTTPResp(resp));
  //write body
  while (true) {
    const data = await resp.body.read();
    if (data.length === 0) {
      break;
    }
    await soWrite(conn, data);
  }
}

//encodes the response headers into a Buffer
//this is better than writing soWrite for every line, so we only end up doing 1 write
function encodeHTTPResp(resp: HTTPRes): Buffer {
    const lines: Buffer[] = [];
    
    // Status line. Note: In a full server, you'd map the code to a reason phrase (e.g., 200 -> OK).
    const reason = resp.code === 200 ? 'OK' : 'Error';
    lines.push(Buffer.from(`HTTP/1.1 ${resp.code} ${reason}\r\n`, 'latin1'));
    
    // Header fields
    for (const h of resp.headers) {
      lines.push(h);
      lines.push(Buffer.from('\r\n', 'latin1'));
    }
    
    // Empty line to signify the end of the headers
    lines.push(Buffer.from('\r\n', 'latin1'));
    
    return Buffer.concat(lines);
}

function soInit(socket: net.Socket): TCPConn {
  const conn: TCPConn = {
    socket: socket, 
    err: null, 
    ended: false,
    reader: null,
  };

  socket.on('data', (data: Buffer) => {
    console.assert(conn.reader !== null);
    conn.socket.pause();
    conn.reader!.resolve(data);
    conn.reader = null;
  })

  socket.on('end', () => {
    conn.ended = true;
    if (conn.reader) {
      conn.reader.resolve(Buffer.from(''));
      conn.reader = null;
    }
  });

  socket.on('error', (err: Error) => {
    conn.err = err;
    if (conn.reader) {
      conn.reader.reject(err);
      conn.reader = null;
    }
  })
  return conn
}

// socket read
function soRead(conn: TCPConn): Promise<Buffer> {
  console.assert(!conn.reader);
  return new Promise((resolve, reject) => {
    if (conn.err) {
      reject(conn.err);
      return;
    }
    if (conn.ended) {
      resolve(Buffer.from(''));
      return;
    }

    conn.reader = {resolve: resolve, reject: reject};
    conn.socket.resume();
  })
}; 

function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
  console.assert(data.length > 0);
  return new Promise((resolve, reject) => {  
    if (conn.err) {
      reject(conn.err);
      return;
    }

    conn.socket.write(data, (err?: Error | null) => {
      if (err)
        reject(err);
      else
        resolve();
    })
  })
};

function bufPush(buf: DynBuf, data: Buffer): void {
  const newLen = buf.length + data.length;
  if (buf.data.length < newLen) {
    let cap = Math.max(buf.data.length, 32);
    while (cap < newLen) {
      cap *= 2;
    }
    const grown = Buffer.alloc(cap);
    buf.data.copy(grown, 0, 0);
    buf.data = grown;
  }
  data.copy(buf.data, buf.length, 0);
  buf.length = newLen;
}

function bufPop(buf: DynBuf, len: number): void {
  buf.data.copyWithin(0, len, buf.length); 
  buf.length -= len;
}

// splits the raw buffer into lines based on the CRLF (\r\n) delimiter
function splitLines(data: Buffer): Buffer[] {
  const lines: Buffer[] = [];
  let start = 0;
  // Look for \r\n
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i] === 0x0d && data[i + 1] === 0x0a) {
      lines.push(data.subarray(start, i));
      start = i + 2;
      i++; // Skip the \n
    }
  }
  lines.push(data.subarray(start)); // Push any remaining data
  return lines;
}

// parses the first line of the HTTP request: METHOD URI VERSION
function parseRequestLine(line: Buffer): [string, Buffer, string] {
  const str = line.toString('latin1');
  const parts = str.split(' ');
  
  if (parts.length !== 3) {
    throw new HTTPError(400, 'Bad request line');
  }
  
  return [parts[0], Buffer.from(parts[1], 'latin1'), parts[2]];
}

// check to ensure the header field follows the 'Name: value' format
function validateHeader(header: Buffer): boolean {
  // Check if a colon exists to separate the key and the value
  return header.indexOf(':'.charCodeAt(0)) > 0;
}