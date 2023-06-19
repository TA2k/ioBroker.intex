"use strict";

/*
 * Created with @iobroker/create-adapter v2.0.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const axios = require("axios");
const Buffer = require('safe-buffer').Buffer
const Json2iob = require("./lib/json2iob");

// Load your modules here, e.g.:
// const fs = require("fs");


const typOnOff = 0x01;
const typRefresh = 0x02;
const typTemp = 0x03;
const typCelsius = 0x04;



const CONTROLLER_ON    =       0x01
const FILTER_ON        =       0x02
const HEATER_ON        =       0x04
const WATER_JET_ON     =       0x08
const BUBBLE_ON        =       0x10
const SANITIZER_ON     =       0x20

const HEADERS = {
                  "Content-Type": "application/json",
                  Accept: "*/*",
                  "User-Agent": "Intex/1.0.13 (iPhone; iOS 14.8; Scale/3.00)",
                  "Accept-Language": "de-DE;q=1, en-DE;q=0.9",
                };
const URL = "https://intexiotappservice.azurewebsites.net/"

const controlChannel = 'control'


class Intex extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: "intex",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Reset the connection indicator during startup
        this.setState("info.connection", false, true);
        if (this.config.interval < 0.5) {
            this.log.info("Set interval to minimum 0.5");
            this.config.interval = 0.5;
        }
        this.requestClient = axios.create();
        this.updateInterval = null;
        this.reLoginTimeout = null;
        this.refreshTokenTimeout = null;
        this.json2iob = new Json2iob(this);
        this.deviceArray = [];
        this.session = {};
        this.commandObject = {};
        this.subscribeStates("*");
        this.check = {};
        this.operation = { "PowerOnOff" : {iobrokerId: 'Power', typ : typOnOff, byteIndex: 0x05, boolBit: CONTROLLER_ON},
                           "JetOnOff" : {iobrokerId: 'Jet', typ : typOnOff, byteIndex: 0x05, boolBit: WATER_JET_ON},
                           "BubbleOnOff" : {iobrokerId: 'Bubble', typ : typOnOff, byteIndex: 0x05, boolBit: BUBBLE_ON},
                           "HeatOnOff" : {iobrokerId: 'Heat', typ : typOnOff, byteIndex: 0x05, boolBit: HEATER_ON},
                           "FilterOnOff" : {iobrokerId: 'Filter', typ : typOnOff, byteIndex: 0x05, boolBit: FILTER_ON},
                           "SanitizerOnOff" : {iobrokerId: 'Sanitzer', typ : typOnOff, byteIndex: 0x05, boolBit: SANITIZER_ON},
                           "Refresh" : {typ : typRefresh},
                           "TempSet" : {iobrokerId: 'TargetTemperature', typ : typTemp, subOperation : "Temp", byteIndex: 0x0f},
                           "Temp" : {iobrokerId: 'Temperature', typ : typTemp, subOperation : "Celsius" , byteIndex: 0x07, readonly: true},
                           "Celsius" : {iobrokerId: 'Celsius', typ : typCelsius, byteIndex: 0x0f, testFunc: function(val){return val <= 43 }},
                         }
        this.control = {};

        if (this.config.username) {
            await this.login();
        }

        if (this.session.token) {
            await this.getDeviceList();
            await this.updateDevices();
            this.updateInterval = setInterval(async () => {
                await this.updateDevices();
            }, this.config.interval * 60 * 1000);
            this.refreshTokenInterval = setInterval(() => {
                this.login();
            }, 1 * 60 * 60 * 1000); //1hour
        }
        if (this.config.hostname) {
            await this.initLocalTree();
            await this.updateLocalDevice();
            this.updateInterval = setInterval(async () => {
                await this.updateLocalDevice();
            }, this.config.interval * 60 * 1000);
        }
    }
    
    getHeadersAuth () {
      return Object.assign(HEADERS, {Authorization: "Bearer " + this.session.token});
    }
    
    async login() {
        await this.requestClient({
            method: "post",
            url: URL + "api/oauth/auth",
            headers: HEADERS,
            data: JSON.stringify({
                account: this.config.username,
                password: new Buffer(this.config.password).toString("base64"),
            }),
        })
            .then((res) => {
                this.log.debug(JSON.stringify(res.data));

                this.setState("info.connection", true, true);
                this.session = res.data;
            })
            .catch((error) => {
                this.log.error(error);
                if (error.response) {
                    this.log.error(JSON.stringify(error.response.data));
                }
            });
    }

    toFahrenheit(celsius) {
      return Math.round(celsius * 1.8 + 32)
    }

    toCelsius(fahrenheit) {
      return Math.round((fahrenheit - 32) / 1.8)
    }

    createOperation (device,operation,command) {
      if (operation.subOperation) this.createOperation(device,this.operation[operation.subOperation],null)
      let co = {write: !operation.readonly, read: true}
      switch (operation.typ) {
        case typOnOff: 
          co.type = "boolean";
          co.role = "switch.power";
          break;
        case typRefresh: 
          co = false
          break;
        case typTemp: 
          co.type = "number";
          co.role = "value.temperature";
          break;
        case typCelsius:
          co.type = "boolean";
          co.role = "indicator";
          break;
      }
      if (co) {
        co.name = operation.iobrokerId
        let id=device.deviceId + "."+controlChannel+"." + operation.iobrokerId
        if (!this.control[device.deviceId]) this.control[device.deviceId] = {}
        if (!this.control[device.deviceId][operation.iobrokerId]) this.control[device.deviceId][operation.iobrokerId] = {}
        this.control[device.deviceId][operation.iobrokerId].operation = operation
        this.control[device.deviceId][operation.iobrokerId].id = id
        this.control[device.deviceId][operation.iobrokerId].command = command
        this.setObjectNotExists(id, {
            type: "state",
            "common": co,
            native: {},
        });
      }
    }

    async initLocalTree() {
        let device = {};
        device.deviceId = "localtcp";
        await this.setObjectNotExistsAsync(device.deviceId, {
            type: "device",
            common: {
                name: "localtcp",
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(device.deviceId + ".remote", {
            type: "channel",
            common: {
                name: "Remote Controls",
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(device.deviceId + ".general", {
            type: "channel",
            common: {
                name: "General Information",
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(device.deviceId + ".status", {
            type: "channel",
            common: {
                name: "Status values",
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(device.deviceId + "." + controlChannel, {
            type: "channel",
            common: {
                name: "Remote Controls",
            },
            native: {},
        });

        // fixed commandset 
        let res = {};
        res.data = JSON.parse('[{"id":18,"commandSetTypeId":3,"currentVersion":"1.8","commandSetType":"TESPA02","commandName":"PowerOnOff","commandData":"8888060F014000"},{"id":19,"commandSetTypeId":3,"currentVersion":"1.8","commandSetType":"TESPA02","commandName":"JetOnOff","commandData":"8888060F011000"},{"id":20,"commandSetTypeId":3,"currentVersion":"1.8","commandSetType":"TESPA02","commandName":"BubbleOnOff","commandData":"8888060F010400"},{"id":21,"commandSetTypeId":3,"currentVersion":"1.8","commandSetType":"TESPA02","commandName":"HeatOnOff","commandData":"8888060F010010"},{"id":22,"commandSetTypeId":3,"currentVersion":"1.8","commandSetType":"TESPA02","commandName":"FilterOnOff","commandData":"8888060F010004"},{"id":23,"commandSetTypeId":3,"currentVersion":"1.8","commandSetType":"TESPA02","commandName":"SanitizerOnOff","commandData":"8888060F010001"},{"id":24,"commandSetTypeId":3,"currentVersion":"1.8","commandSetType":"TESPA02","commandName":"Refresh","commandData":"8888060FEE0F01"},{"id":25,"commandSetTypeId":3,"currentVersion":"1.8","commandSetType":"TESPA02","commandName":"TempSet","commandData":"8888050F0C"}]');
        for (const command of res.data) {
            //old start
            if (command.commandName === "Refresh") {
                this.commandObject[device.deviceId] = command.commandData;
            }
            if (command.commandName == "TempSet") {
              this.setObjectNotExists(device.deviceId + ".remote." + command.commandName, {
                  type: "state",
                  common: {
                      name: command.commandData,
                      type: "number",
                      role: "value",
                      write: true,
                      read: true,
                  },
                  native: {},
              });
            } else {
              this.setObjectNotExists(device.deviceId + ".remote." + command.commandName, {
                  type: "state",
                  common: {
                      name: command.commandData,
                      type: "boolean",
                      role: "boolean",
                      write: true,
                      read: true,
                  },
                  native: {},
              });
            }
            //old end
            
            //new
            let operation=this.operation[command.commandName]
            if (operation) { 
              this.createOperation(device,operation,command) 
            } else {
              this.log.warn("unknown commandName: "+command.commandName)
            }
        }

    }

    async getDeviceList() {
        await this.requestClient({
            method: "get",
            url: URL + "api/v1/userdevice/user",
            headers: this.getHeadersAuth(),
        })
            .then(async (res) => {
                this.log.debug(JSON.stringify(res.data));
                for (const device of res.data) {
                    this.deviceArray.push(device.deviceId);
                    await this.setObjectNotExistsAsync(device.deviceId, {
                        type: "device",
                        common: {
                            name: device.deviceAliasName,
                        },
                        native: {},
                    });
                    await this.setObjectNotExistsAsync(device.deviceId + ".remote", {
                        type: "channel",
                        common: {
                            name: "Remote Controls",
                        },
                        native: {},
                    });
                    await this.setObjectNotExistsAsync(device.deviceId + ".general", {
                        type: "channel",
                        common: {
                            name: "General Information",
                        },
                        native: {},
                    });
                    await this.setObjectNotExistsAsync(device.deviceId + ".status", {
                        type: "channel",
                        common: {
                            name: "Status values",
                        },
                        native: {},
                    });
                    await this.setObjectNotExistsAsync(device.deviceId + "." + controlChannel, {
                        type: "channel",
                        common: {
                            name: "Remote Controls",
                        },
                        native: {},
                    });

                    this.json2iob.parse(device.deviceId + ".general", device);

                    this.requestClient({
                        method: "get",
                        url: URL + "/api/v1/commandset/device/" + device.deviceId,
                        headers: this.getHeadersAuth(),
                    })
                        .then((res) => {
                            this.log.debug(JSON.stringify(res.data));
                            for (const command of res.data) {
                                //old start
                                if (command.commandName === "Refresh") {
                                    this.commandObject[device.deviceId] = command.commandData;
                                }
                                if (command.commandName == "TempSet") {
                                  this.setObjectNotExists(device.deviceId + ".remote." + command.commandName, {
                                      type: "state",
                                      common: {
                                          name: command.commandData,
                                          type: "number",
                                          role: "value",
                                          write: true,
                                          read: true,
                                      },
                                      native: {},
                                  });
                                } else {
                                  this.setObjectNotExists(device.deviceId + ".remote." + command.commandName, {
                                      type: "state",
                                      common: {
                                          name: command.commandData,
                                          type: "boolean",
                                          role: "boolean",
                                          write: true,
                                          read: true,
                                      },
                                      native: {},
                                  });
                                }
                                //old end
                                
                                //new
                                let operation=this.operation[command.commandName]
                                if (operation) { 
                                  this.createOperation(device,operation,command) 
                                } else {
                                  this.log.warn("unknown commandName: "+command.commandName)
                                }
                            }
                        })
                        .catch((error) => {
                            this.log.error(error);
                            error.response && this.log.error(JSON.stringify(error.response.data));
                        });
                }
            })
            .catch((error) => {
                this.log.error(error);
                error.response && this.log.error(JSON.stringify(error.response.data));
            });
    }

    async updateLocalDevice() {
        if (this.config.hostname) {
            const deviceId = "localtcp";
            this.log.debug("fetching info from hostname:" + this.config.hostname);

            var net = require('net');

            var client = new net.Socket();
            const sid = Date.now();
            client.connect(8990, this.config.hostname, () => {
                client.write(JSON.stringify({
                    sid: String(sid),
                    type: 1,
                    data: "8888060FEE0F01DA",
                }) + "\r\n");
            });

            client.on('data',async (data) => {
                this.log.debug('updateLocalDevice: Received: ' + data.toString("utf-8"));
                const res = {};
                const jdata = JSON.parse(data.toString("utf-8"));
                const returnValue = Buffer.from(jdata.data,'hex');
                res.data = jdata;

                //old start
                for (let index = 0; index < returnValue.length; index += 1) {

                    await this.setObjectNotExistsAsync(deviceId + ".status.value" + index, {
                        type: "state",
                        common: {
                            role: "value",
                            type: "number",
                            write: false,
                            read: false,
                        },
                        native: {},
                    });

                    this.setState(deviceId + ".status.value" + index, returnValue.readUInt8(index) , true);
                }

                Object.keys(this.control[deviceId]).forEach(function(key) {
                    let control = this.control[deviceId][key];
                    let theValue;
                    if (control.operation.byteIndex) theValue = returnValue.readUInt8(control.operation.byteIndex)
                    if (control.operation.boolBit) theValue = ((theValue & control.operation.boolBit) == control.operation.boolBit)
                    if (control.operation.testFunc) theValue = control.operation.testFunc(theValue)
                    if (typeof theValue !== 'undefined') {
                        if (this.check[control.id]) {
                            this.log.debug("Test set control " + control.id + " with " + this.check[control.id].val + " !== " + theValue + " / " + this.check[control.id].ti + " < " + res.data.sid)
                            if (this.check[control.id].val !== theValue) {
                                if (this.check[control.id].ti < res.data.sid) {
                                    if (this.check[control.id].attempt <= 5) {
                                        this.setState(control.id , this.check[control.id].val, false)
                                    } else {
                                        this.log.warn("Cannot set control " + control.id + " to " + this.check[control.id].val)
                                        this.setState(control.id , theValue, true);
                                        delete this.check[control.id]
                                    }
                                }
                            } else {
                                delete this.check[control.id]
                            }
                        } else {
                            this.setState(control.id , theValue, true);
                        }
                    }
                }.bind(this));

                this.setState("info.connection", true, true);


                client.destroy(); // kill client after server's response
            });

            client.on('close', () => {
                this.log.debug('updateLocalDevice: Connection closed');
            });

        }
    }

    async updateDevices() {
        this.deviceArray.forEach(async (deviceId) => {
            const sid = Date.now();
            await this.requestClient({
                method: "post",
                url: URL + "api/v1/command/" + deviceId,
                headers: this.getHeadersAuth(),
                data: JSON.stringify({
                    sid: sid,
                    type: "1",
                    data: "8888060FEE0F01DA",
                }),
            })
                .then(async (res) => {
                    this.log.debug(JSON.stringify(res.data));
                    await this.sleep(20000);
                    await this.requestClient({
                        method: "GET",
                        url: URL + "api/v1/device/command/feedback/" + deviceId + "/" + sid,
                        headers: this.getHeadersAuth(),
                    })
                        .then(async (res) => {
                            this.log.debug(JSON.stringify(res.data));
                            if (res.data && res.data.result === "ok") {
                                const returnValue = Buffer.from(res.data.data,'hex');

                                //old start
                                for (let index = 0; index < returnValue.length; index += 1) {
                                    await this.setObjectNotExistsAsync(deviceId + ".status.value" + index, {
                                        type: "state",
                                        common: {
                                            role: "value",
                                            type: "number",
                                            write: false,
                                            read: false,
                                        },
                                        native: {},
                                    });

                                    this.setState(deviceId + ".status.value" + index, returnValue.readUInt8(index) , true);
                                }
                                //old end
                                Object.keys(this.control[deviceId]).forEach(function(key) {
                                  let control = this.control[deviceId][key];
                                  let theValue;
                                  if (control.operation.byteIndex) theValue = returnValue.readUInt8(control.operation.byteIndex)
                                  if (control.operation.boolBit) theValue = ((theValue & control.operation.boolBit) == control.operation.boolBit)
                                  if (control.operation.testFunc) theValue = control.operation.testFunc(theValue)
                                  if (typeof theValue !== 'undefined') {
                                    if (this.check[control.id]) {
                                      this.log.debug("Test set control " + control.id + " with " + this.check[control.id].val + " !== " + theValue + " / " + this.check[control.id].ti + " < " + res.data.sid)
                                      if (this.check[control.id].val !== theValue) {
                                        if (this.check[control.id].ti < res.data.sid) {
                                          if (this.check[control.id].attempt <= 5) {
                                            this.setState(control.id , this.check[control.id].val, false)
                                          } else {
                                            this.log.warn("Cannot set control " + control.id + " to " + this.check[control.id].val)
                                            this.setState(control.id , theValue, true);
                                            delete this.check[control.id]
                                          }
                                        }
                                      } else {
                                        delete this.check[control.id]
                                      }
                                    } else {
                                      this.setState(control.id , theValue, true);
                                    }
                                  }
                                }.bind(this));
                            }
                        })
                        .catch((error) => {
                            this.log.error(error);
                            if (error.response) {
                                this.log.error(JSON.stringify(error.response.data));
                            }
                        });
                })
                .catch((error) => {
                    if (error.response && error.response.status >= 500) {
                        this.log.warn("Service not reachable");
                        error.response && this.log.debug(JSON.stringify(error.response.data));
                        return;
                    }
                    this.log.error(error);
                    if (error.response) {
                        this.log.error(JSON.stringify(error.response.data));
                    }
                });
        });
    }

    sleep(ms) {
        return new Promise((resolve) => {
            this.sleepTimeout = setTimeout(resolve, ms);
        });
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.setState("info.connection", false, true);
            this.refreshTimeout && clearTimeout(this.refreshTimeout);
            this.reLoginTimeout && clearTimeout(this.reLoginTimeout);
            this.refreshTokenTimeout && clearTimeout(this.refreshTokenTimeout);
            this.updateInterval && clearInterval(this.updateInterval);
            this.refreshTokenInterval && clearInterval(this.refreshTokenInterval);
            this.sleepTimeout && clearInterval(this.sleepTimeout);
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Calculates the checksum, currently the algorithm is not yet known. These are returned from a list.
     * @param {string} data
     * @return (string) checksum
     */
    calcChecksum (data) {
        const objectEndings = {
            "8888060f014000": 0x98,
            "8888060fee0f01": 0xda,
            "8888060f010400": 0xd4,
            "8888060f010004": 0xd4,
            "8888060f011000": 0xc8,
            "8888060f010010": 0xc8,
            "8888060f010001": 0xd7,
        };
        const temp = {"8888050f0c" : 0xce};
        
        let key = data.toString('hex')

        let sum = objectEndings[key];
        if (typeof sum !== 'undefined') {
          return sum;
        }
        

        sum = temp[key.substr(0,10)];
        if (typeof sum !== 'undefined') {
          sum = sum - parseInt(key.substr(10,2), 16);
          return sum;
        }
    }
    
    async sendLocalCommand(deviceId, send) {
            var net = require('net');
            var client = new net.Socket();
            const sid = Date.now();
            client.connect(8990, this.config.hostname, () => {
                client.write(JSON.stringify({
                    sid: String(sid),
                    type: 1,
                    data: send,
                }) + "\r\n");
            });

            client.on('data',async (data) => {
                this.log.debug('sendLocalCommand: Received: ' + data.toString("utf-8"));
                const jdata = JSON.parse(data.toString("utf-8"));
                const returnValue = Buffer.from(jdata.data,'hex');

                client.destroy(); // kill client after server's response
            });

            client.on('close', () => {
            });

    }
    
    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {
        /*
            "commandName": "PowerOnOff",
            "commandData": "8888060F014000"
            "commandName": "JetOnOff",
            "commandData": "8888060F011000"

            "commandName": "BubbleOnOff",
            "commandData": "8888060F010400"


            "commandName": "HeatOnOff",
            "commandData": "8888060F010010"

            "commandName": "FilterOnOff",
            "commandData": "8888060F010004"

            "commandName": "SanitizerOnOff",
            "commandData": "8888060F010001"

            "commandName": "Refresh",
            "commandData": "8888060FEE0F01"

            "commandName": "TempSet",
            "commandData": "8888050F0C"
                            8888050F0C0AC4 ==> 10
                            8888050F0C0BC3 ==> 11
                            8888050F0C0CC2 ==> 11
                            8888050F0C0DC1 ==> 13
                            8888050F0C0EC0 ==> 14
                            8888050F0C0FBF ==> 15
                            8888050F0C10BE ==> 16
                            8888050F0C11BD ==> 17
                            8888050F0C12BC ==> 18
                            8888050F0C13BB ==> 19
                            8888050F0C14BA ==> 20
                            8888050F0C15B9 ==> 21
                            8888050F0C16B8 ==> 22
                            8888050F0C17B7 ==> 23
                            8888050F0C18B6 ==> 24
                            8888050F0C19B5 ==> 25
                            8888050F0C1AB4 ==> 26
                            8888050F0C1BB3 ==> 27
                            8888050F0C1CB2 ==> 28
                            8888050F0C1DB1 ==> 29
                            8888050F0C1EB0 ==> 30
                            8888050F0C1FAF ==> 31
                            8888050F0C20AE ==> 32
                            8888050F0C21AD ==> 33
                            8888050F0C22AC ==> 34
                            8888050F0C23AB ==> 35
                            8888050F0C24AA ==> 36
                            8888050F0C25A9 ==> 37
                            8888050F0C26A8 ==> 38
                            8888050F0C27A7 ==> 39
                            8888050F0C28A6 ==> 40

                  8888050F0C26A8
                  8888060F01400098
                  8888060FEE0F01DA
                  8888060F010400D4
                  8888060F010004D4
                  8888060F011000C8
                  8888060F010010C8
        */
        if (state) {
            if (!state.ack) {
                const splitid = id.split(".")
                const deviceId = splitid[2];
                const channelId = splitid[3];
                const objId= splitid[4];
                let objectData
                if (this.control[deviceId] && (controlChannel == channelId) && this.control[deviceId][objId]) {
                    let objctl = this.control[deviceId][objId]
                    switch (objctl.operation.typ) {
                        case typOnOff: 
                            objectData =  Buffer.from(objctl.command.commandData,'hex');
                            //erstmal das Timeout zurücksetzen es gibt gelich ein neues
                            clearTimeout(this.refreshTimeout);
                            const checkid = this.control[deviceId][objId].id
                            if (!this.check[checkid] || this.check[checkid].val != state.val) {
                              this.check[checkid] = {attempt : 1, val: state.val, ti: Date.now()}
                            } else {
                              this.check[checkid].attempt++
                            }
                            if (state.val == state.oldVal) {
                              clearTimeout(this.refreshTimeout);
                              this.refreshTimeout = setTimeout(async () => {
                                  await this.updateDevices();
                              }, 10 * 1000);
                              return
                            }
                            break;
                        case typTemp: 
                            objectData =  Buffer.from(objctl.command.commandData,'hex');
                            if (((state.val >= 10 && state.val <= 40) || (state.val >= 50 && state.val <= 104)) && Math.round(state.val) == state.val) {
                                objectData = Buffer.concat([objectData, Buffer.from([Math.round(state.val)])]);
                            } else {
                                this.log.warn("Value: "+state.val+" not in range 10..40 and 50..104 of integer")
                                return
                            }
                            break;
                        case typCelsius:
                            if (this.control[deviceId]["TargetTemperature"]) {
                                let target = this.control[deviceId]["TargetTemperature"]
                                let targetState = await this.getStateAsync(target.id)
                                if (state.val && !objctl.operation.testFunc(targetState.val)) {
                                    targetState.val = this.toCelsius(targetState.val)
                               } else if (!state.val && objctl.operation.testFunc(targetState.val)) {
                                   targetState.val = this.toFahrenheit(targetState.val)
                               }
                               this.setState(target.id,targetState.val,false)
                            }
                            return;
                            break;
                        default:
                           return;
                    }
                } else {
                    const object = await this.getObjectAsync(id);
                    objectData =  Buffer.from(object.common.name,'hex');
                    // <= 43 Celsius >=44 Fahrenheit
                    if (object.common.name === '8888050F0C') {
                      if (((state.val >= 10 && state.val <= 40) || (state.val >= 50 && state.val <= 104)) && Math.round(state.val) == state.val) {
                        objectData = Buffer.concat([objectData, Buffer.from([Math.round(state.val)])]);
                      } else {
                        this.log.warn("Value: "+state.val+" not in range 10..40 and 50..104 of integer")
                        return
                      }
                    }
                }
                let send=objectData.toString('hex') + Buffer.from([this.calcChecksum(objectData)]).toString('hex');
                send = send.toUpperCase();
                clearTimeout(this.refreshTimeout);
                try {
                  this.log.debug("send:"+send + " to:" + deviceId)
                  if ("localtcp"==deviceId) {
                    await this.sendLocalCommand(deviceId, send);
                    this.refreshTimeout = setTimeout(async () => {
                        await this.updateLocalDevice();
                    }, 10 * 1000);
                    return;
                  }
                  await this.requestClient({
                      method: "post",
                      url: URL + "api/v1/command/" + deviceId,
                      headers: this.getHeadersAuth(),
                      data: JSON.stringify({
                          sid: Date.now(),
                          type: "1",
                          data: send,
                      }),
                  })
                      .then((res) => {
                          this.log.debug(JSON.stringify(res.data));
                          return res.data;
                      })
                      .catch((error) => {
                          this.log.error(error);
                          if (error.response) {
                              this.log.error(JSON.stringify(error.response.data));
                          }
                      });
                } finally {
                    this.refreshTimeout = setTimeout(async () => {
                        await this.updateDevices();
                    }, 10 * 1000);
                }
            }
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Intex(options);
} else {
    // otherwise start the instance directly
    new Intex();
}
