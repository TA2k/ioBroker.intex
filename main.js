"use strict";

/*
 * Created with @iobroker/create-adapter v2.0.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const axios = require("axios");
const Json2iob = require("./lib/json2iob");

// Load your modules here, e.g.:
// const fs = require("fs");

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
        this.objectEndings = {
            "8888060F014000": "98",
            "8888060FEE0F01": "DA",
            "8888060F010400": "D4",
            "8888060F010004": "D4",
            "8888060F011000": "C8",
            "8888060F010010": "C8",
            "8888060F010001": "D7",
        };
        this.subscribeStates("*");

        await this.login();

        if (this.session.token) {
            await this.getDeviceList();
            await this.updateDevices();
            this.updateInterval = setInterval(async () => {
                await this.updateDevices();
            }, this.config.interval * 60 * 1000);
            this.refreshTokenInterval = setInterval(() => {
                this.refreshToken();
            }, 1 * 60 * 60 * 1000); //1hour
        }
    }
    async login() {
        await this.requestClient({
            method: "post",
            url: "https://intexiotappservice.azurewebsites.net/api/oauth/auth",
            headers: {
                "Content-Type": "application/json",
                Accept: "*/*",
                "User-Agent": "Intex/1.0.13 (iPhone; iOS 14.8; Scale/3.00)",
                "Accept-Language": "de-DE;q=1, en-DE;q=0.9",
            },
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
    async getDeviceList() {
        await this.requestClient({
            method: "get",
            url: "https://intexiotappservice.azurewebsites.net/api/v1/userdevice/user",
            headers: {
                "Content-Type": "application/json",
                Accept: "*/*",
                "User-Agent": "Intex/1.0.13 (iPhone; iOS 14.8; Scale/3.00)",
                "Accept-Language": "de-DE;q=1, en-DE;q=0.9",
                Authorization: "Bearer " + this.session.token,
            },
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

                    this.json2iob.parse(device.deviceId + ".general", device);

                    this.requestClient({
                        method: "get",
                        url: "https://intexiotappservice.azurewebsites.net//api/v1/commandset/device/" + device.deviceId,
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "*/*",
                            "User-Agent": "Intex/1.0.13 (iPhone; iOS 14.7; Scale/3.00)",
                            "Accept-Language": "de-DE;q=1, en-DE;q=0.9",
                            Authorization: "Bearer " + this.session.token,
                        },
                    })
                        .then((res) => {
                            this.log.debug(JSON.stringify(res.data));
                            for (const command of res.data) {
                                if (command.commandName === "Refresh") {
                                    this.commandObject[device.deviceId] = command.commandData;
                                }
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

    async updateDevices() {
        this.deviceArray.forEach(async (deviceId) => {
            const sid = Date.now();
            await this.requestClient({
                method: "post",
                url: "https://intexiotappservice.azurewebsites.net/api/v1/command/" + deviceId,
                headers: {
                    "Content-Type": "application/json",
                    Accept: "*/*",
                    "User-Agent": "Intex/1.0.13 (iPhone; iOS 14.7; Scale/3.00)",
                    "Accept-Language": "de-DE;q=1, en-DE;q=0.9",
                    Authorization: "Bearer " + this.session.token,
                },
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
                        url: "https://intexiotappservice.azurewebsites.net/api/v1/device/command/feedback/" + deviceId + "/" + sid,
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "*/*",
                            "User-Agent": "Intex/1.0.13 (iPhone; iOS 14.7; Scale/3.00)",
                            "Accept-Language": "de-DE;q=1, en-DE;q=0.9",
                            Authorization: "Bearer " + this.session.token,
                        },
                    })
                        .then(async (res) => {
                            this.log.debug(JSON.stringify(res.data));
                            if (res.data && res.data.result === "ok") {
                                const returnValue = res.data.data;

                                for (var n = 0; n < returnValue.length; n += 2) {
                                    const index = n / 2;
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

                                    this.setState(deviceId + ".status.value" + index, parseInt(returnValue.substr(n, 2), 16), true);
                                }
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
                    this.log.error(error);
                    if (error.response) {
                        this.log.error(JSON.stringify(error.response.data));
                    }
                });
        });
    }

    async refreshToken() {
        await this.requestClient({
            method: "POST",
            url: "https://intexiotappservice.azurewebsites.net/api/oauth/auth",

            headers: {
                accept: "*/*",
                "content-type": "application/json",
            },
            data: { refresh_token: this.session.refreshToken },
        })
            .then((res) => {
                this.log.debug(JSON.stringify(res.data));
                this.session = res.data;
                this.setState("info.connection", true, true);
                return res.data;
            })
            .catch((error) => {
                this.log.error("refresh token failed");
                this.log.error(error);
                error.response && this.log.error(JSON.stringify(error.response.data));
                this.log.error("Start relogin in 1min");
                this.reLoginTimeout = setTimeout(() => {
                    this.login();
                }, 1000 * 60 * 1);
            });
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.setState("info.connection", false, true);
            clearTimeout(this.refreshTimeout);
            clearTimeout(this.reLoginTimeout);
            clearTimeout(this.refreshTokenTimeout);
            clearInterval(this.updateInterval);
            clearInterval(this.refreshTokenInterval);
            callback();
        } catch (e) {
            callback();
        }
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
                const deviceId = id.split(".")[2];
                const object = await this.getObjectAsync(id);
                const objectData = object.common.name;
                await this.requestClient({
                    method: "post",
                    url: "https://intexiotappservice.azurewebsites.net/api/v1/command/" + deviceId,
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "*/*",
                        "User-Agent": "Intex/1.0.13 (iPhone; iOS 14.7; Scale/3.00)",
                        "Accept-Language": "de-DE;q=1, en-DE;q=0.9",
                        Authorization: "Bearer " + this.session.token,
                    },
                    data: JSON.stringify({
                        sid: Date.now(),
                        type: "1",
                        data: objectData + this.objectEndings[objectData],
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
                clearTimeout(this.refreshTimeout);
                this.refreshTimeout = setTimeout(async () => {
                    await this.updateDevices();
                }, 10 * 1000);
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
