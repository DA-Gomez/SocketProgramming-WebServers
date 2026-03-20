### Work in progress 

The purpose of this project is to expand my knowledge of backend design. I decided to start here as it is important to understand the logic behind what  

### How to Run

`$ npx ts-node filename.ts` to compile the ts code into javascript

`$ node --enable-source-maps filename.js` to run the server

To open a client and message the server open a new terminal 


#### Run HTTP server

`$ npx tsc HTTPServer.ts`

`$ node --enable-source-maps HTTPServer.js` 

`$ curl -s --data-binary 'hello' http://127.0.0.1:1234/`

`$ curl -s --data-binary 'hello' http://127.0.0.1:1234/echo` to echo the data 
