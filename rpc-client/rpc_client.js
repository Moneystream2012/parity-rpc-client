'use strict'
const ACCOUNT_ADDRESS = '0x007567606d3ae13ee2c9c70b527d32c3ca680e9d'
const ACCOUNT_PASSWORD = 'kristina19092009'
const KEY_DIRECTORY = '/parity-keys'
const NODE_T = 0

const os = require('os')
const fs = require('fs')
const findRemoveSync = require('find-remove')
const querystring = require('querystring')
const http = require('http')
const unirest = require('unirest')
const ethKey = require('keythereum')
const ethUtil = require('ethereumjs-util')
const secp256k1 = require('secp256k1')

function isFunction (f) {
  return typeof f === 'function'
}

function getPrivateKey (address, pwd, keydir) {
  let keyObj = ethKey.importFromFile(address, os.homedir() + keydir)
  return ethKey.recover(pwd, keyObj)
}

function doRequest (port, endpoint, method, data, success) {
  let dataString = JSON.stringify(data)
  let headers = {}

  if (method === 'GET') {
    endpoint += '?' + querystring.stringify(data)
  } else {
    headers = {
      'Content-Type': 'application/json',
      'Content-Length': dataString.length
    }
  }
  let options = {
    host: 'localhost',
    port: port,
    path: endpoint,
    method: method,
    headers: headers
  }

  let req = http.request(options, function (res) {
    res.setEncoding('utf-8')

    let responseString = ''

    res.on('data', function (data) {
      responseString += data
    })

    res.on('end', function () {
      // console.log(responseString)
      let responseObject = JSON.parse(responseString)
      success(responseObject)
    })
  })

  req.write(dataString)
  req.end()
}

function run (cb, doc, T) {
  doRequest(8545, '/', 'POST', {
    'method': 'personal_unlockAccount',
    'params': [ACCOUNT_ADDRESS, ACCOUNT_PASSWORD, null],
    'id': 1,
    'jsonrpc': '2.0'
  }, function (data) {
    console.log('\nUnlock account status: ', data.result)

    if (data.result) {
      doRequest(8545, '/', 'POST', {
        'method': 'parity_exportAccount',
        'params': [ACCOUNT_ADDRESS, ACCOUNT_PASSWORD],
        'id': 2,
        'jsonrpc': '2.0'
      }, function (data) {
        console.log('\nAccount data: ', data.result)

        let keydir = os.homedir() + KEY_DIRECTORY + '/keystore'
        findRemoveSync(keydir, {files: '*.*'})
        ethKey.exportToFile(data.result, keydir)

        if (isFunction(cb)) {
          cb(doc, T)
        }
      })
    }
  })
}

function encode (documentBody, T) {
  let privateKey = getPrivateKey(ACCOUNT_ADDRESS, ACCOUNT_PASSWORD, KEY_DIRECTORY)
  let address = ethKey.privateKeyToAddress(privateKey)
  console.log(`\nsecret is ${privateKey.toString('hex')},\naddress is ${address}`)

  let hash = ethUtil.sha3(documentBody + new Date().toISOString()).toString('hex')
  let signedHash = secp256k1.sign(Buffer.from(hash, 'hex'), privateKey)
  console.log(`\nsign is ${signedHash.signature.toString('hex')}`)

  doRequest(8082, '/' + hash + '/' + signedHash.signature.toString('hex') + '00/' + T, 'POST', {
  }, function (documentKey) {
    console.log('\nSimultaneously generate server-side and document key:', documentKey, '\n')

    let dataBinary = '{"jsonrpc": "2.0", "method": "secretstore_encrypt", "params": ["' + ACCOUNT_ADDRESS + '", "' +
      ACCOUNT_PASSWORD + '", "' + documentKey + '", "0x' + documentBody + '"], "id":777 }'
    let Request = unirest.post('http://127.0.0.1:8545/')
    Request.headers({'Content-Type': 'application/json'})
    Request.send(dataBinary)
    Request.end(res => console.log('\nStatus code: ', res.status, '\nbody: ', res.body))
  })
}

let filename = process.argv[2]
if (filename === 'undefined') throw new Error('no filename specified!')

let documentBody = fs.readFileSync(os.homedir() + KEY_DIRECTORY + '/' + filename).toString('hex')
if (documentBody == null || documentBody === '') throw new Error('no file specified!')

run(encode, documentBody, NODE_T)
