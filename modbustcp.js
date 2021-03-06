/**
 * Original Work Copyright 2015 Valmet Automation Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Modified work Copyright 2016 Argonne National Laboratory.
 *
 * Licensed under the the BSD 3-Clause License (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

function timestamp() {
    return new Date().toISOString().replace(/T/, ' ').     // replace T with a space
    replace(/\..+/, '')
}
function log(msg, args) {
    if (args)
        console.log(timestamp() + ': ' + msg, args);
    else
        console.log(timestamp() + ': ' + msg);
}


module.exports = function (RED) {
    var modbus = require('jsmodbus');
    var util = require('util');   


    function ModbusTCPServerNode(config) {
        RED.nodes.createNode(this, config);                
        this.host = config.host;
        this.port = config.port;
        this.reconnect = config.reconnect;
        this.reconnecttimeout = config.reconnecttimeout
        this.unit_id = config.unit_id;
        this.modbusconn = null;        
        var node = this;
        var consettings = {
                    'host': node.host, 
                    'port': node.port, 
                    'unitId': Number(node.unit_id),                    
                    'timeout'           : 15000
                    /*'logEnabled' : true,
                    'logLevel' : 'debug'*/
                };
        
        node.initializeModbusTCPConnection = function (handler) {
            log('Connecting to modbustcp slave at ' + node.host + ':' + node.port + ' unit_id: ' + node.unit_id);                          
            
            if (Number(node.reconnecttimeout) > 0)
            {
                consettings.autoReconnect = true;
                consettings.reconnectTimeout = Number(node.reconnecttimeout)*1000;
            }      

            node.modbusconn = modbus.client.tcp.complete(consettings);
                                       
            node.modbusconn.on('error', function (err) {
                node.error('ModbusTCPConnection: ' + util.inspect(err, false, null));     
            }) 

            node.modbusconn.connect(); 

            handler(node.modbusconn);                   
                    
        };
        
        node.on("close", function () {
            log('Disconnecting from modbustcp slave at ' + node.host + ':' + node.port);            
            node.modbusconn.close();
            node.modbusconn = null;                          
        });
    }

    RED.nodes.registerType("modbustcp-server", ModbusTCPServerNode);
  
    function ModbusTCPWrite(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.dataType = config.dataType;
        this.adr = Number(config.adr);
        this.quantity = config.quantity;
        var node = this;
        var modbusTCPServer = RED.nodes.getNode(config.server);    

            node.receiveEvent1 = function () {                    
                log(node.name + ' was Disconnected'); 
                node.status({fill:"grey",shape:"dot",text:"Disconnected"});                                   
            }; 

            node.receiveEvent2 = function(){                                
                node.status({fill:"green",shape:"dot",text:"Connected"});   
            };    
        
            modbusTCPServer.initializeModbusTCPConnection(function (connection) {
                node.connection = connection;             
                node.connection.on('close', node.receiveEvent1);
                node.connection.on('connect', node.receiveEvent2);
            });

            function set_successful_write(resp) {
                node.status({fill: "green", shape: "dot", text: "Successfully Written"});
            }

            function modbus_error_check(err) {
                if (err) {
                    node.status({fill:"red",shape:"dot",text:"Error"});
                    log(err);                                 
                    node.error(node.name + ': ' + JSON.stringify(err));
                    return false;
                }
                return true;
            }

            node.on("input", function (msg) { 
                                   
                if (node.connection.getState() === 'closed')
                {                   
                    if (!node.connection.autoReconnect)
                    {
                        node.connection.connect();                        
                    } 
                }

                if (!(msg && msg.hasOwnProperty('payload'))) return;
                
                if (msg.payload == null) {
                    node.error(node.name + ': ' + 'Invalid msg.payload!');
                    return;
                }

                node.status(null);
            

                switch (node.dataType) {
                    case "Coil": //FC: 5  
                       
                        node.connection.writeSingleCoil(node.adr, Number(msg.payload)).then(function (resp, err) {
                            if(modbus_error_check(err) && resp) {                                    
                                    set_successful_write(resp);
                            }   
                        }); 

                        break;
                    case "HoldingRegister": //FC: 6                               

                        node.connection.writeSingleRegister(node.adr, Number(msg.payload)).then(function (resp, err) {  
                            if(modbus_error_check(err) && resp) {
                                    set_successful_write(resp);
                            }   
                        });
                             
                        break;  
                    case "Coils": //FC: 15
                    	
                    	if (Array.isArray(msg.payload)) {
                    		var values = [];
	                    	for(i=0;i<msg.payload.length;i++)
	                    	{
	                    		values.push(parseInt(msg.payload[i]));
	                    	}   
                    	}
                    	else {
                    		node.error(node.name + ': ' + 'msg.payload not an array');
                    		break;
                    	}
                        node.connection.writeMultipleCoils(node.adr, values).then(function (resp, err) {                        	
                            if(modbus_error_check(err) && resp) {
                                    set_successful_write(resp);
                            }   
                        }); 

                        break;

                    case "HoldingRegisters": //FC: 16 

                    	if (Array.isArray(msg.payload)) {
                    		var values = [];
	                    	for(i=0;i<msg.payload.length;i++)
	                    	{
	                    		values.push(parseInt(msg.payload[i]));
	                    	}   
                    	}
                    	else {
                    		node.error(node.name + ': ' + 'msg.payload not an array');
                    		break;
                    	}
                        node.connection.writeMultipleRegisters(node.adr, values).then(function (resp, err) {                            
                            if(modbus_error_check(err) && resp) {                                    
                                    set_successful_write(resp);
                            }   
                        });

                        break;

                    default:
                        break;                    
                   }
            }
        );

        node.on("close", function () {
            log(node.name + ':' + 'Closing')             
            node.status({fill:"grey",shape:"dot",text:"Disconnected"});
            node.connection.removeListener('connect', node.receiveEvent2);
            node.connection.removeListener('close', node.receiveEvent1);
            node.connection.close();
        });


    }

    
    RED.nodes.registerType("modbustcp-write", ModbusTCPWrite);

    function ModbusTCPRead(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.dataType = config.dataType;
        this.adr = config.adr;
        this.quantity = config.quantity;
        this.rate = config.rate;
        this.rateUnit = config.rateUnit;
        this.connection = null;      
        var node = this;
               
        var modbusTCPServer = RED.nodes.getNode(config.server);  
        var timerID;       
        

        node.receiveEvent1 = function() {                                      
            log(node.name + ' was disconnected or was unable to connect');                
            node.status({fill:"grey",shape:"dot",text:"Disconnected"});                                                 
            clearInterval(timerID); 
            timerID = null;                               
        };

        node.receiveEvent2 = function() {                                                
            node.status({fill:"green",shape:"dot",text:"Connected: Rate:" + node.rate + " " + node.rateUnit}); 
            clearInterval(timerID);
            timerID = null;       
            ModbusMaster(); //fire once at start                
            if (!timerID) {                    
                timerID = setInterval(function () {                 
                  ModbusMaster();
                }, calcRate());  
            }           
        };      

        modbusTCPServer.initializeModbusTCPConnection(function (connection) {            
            node.connection = connection;
            node.status({fill:"blue",shape:"dot",text:"Initiating....."}); 
            node.connection.on('close', node.receiveEvent1);
            node.connection.on('connect', node.receiveEvent2);             
        });  

            function set_connected_waiting() {
                node.status({fill:"green",shape:"dot",text:"Connected: Rate:" + node.rate + " " + node.rateUnit});
            }

            function set_connected_polling() {
                node.status({fill:"yellow",shape:"dot",text:"Polling"});
            }

            function modbus_error_check(err) {
                if (err) {
                    node.status({fill:"red",shape:"dot",text:"Error"});
                    log(err);                                 
                    node.error('ModbusTCPClient: ' + JSON.stringify(err));
                    return false;
                }
                return true;
            }       

            function calcRate() {
                switch (node.rateUnit) {
                    case "ms":
                        rate = node.rate; //milliseconds
                        break;
                    case "s":
                        rate = node.rate * 1000; //seconds
                        break;
                    case "m":
                        rate = node.rate * 60000; //minutes
                        break;
                    case "h":
                        rate = node.rate * 3600000; //hours
                        break;
                    default:
                        break;
                }
                return rate;
            }

            function ModbusMaster() {
                var msg = {};  
                msg.topic = node.name;     

                    switch (node.dataType){
                        case "Coil": //FC: 1
                            set_connected_polling();
                            node.connection.readCoils(Number(node.adr), Number(node.quantity)).then(function (resp, error) { 
                                if (modbus_error_check(error) && resp) {
                                    set_connected_waiting();
                                    msg.payload = resp.coils; // array of coil values
                                    node.send(msg);
                                }
                            });
                            break;
                        case "Input": //FC: 2
                            set_connected_polling();
                            node.connection.readDiscreteInputs(Number(node.adr), Number(node.quantity)).then(function (resp, error) { 
                                if (modbus_error_check(error) && resp) {
                                    set_connected_waiting();
                                    msg.payload = resp.coils; // array of discrete input values
                                    node.send(msg);
                                }
                            });
                            break;
                        case "HoldingRegister": //FC: 3
                            set_connected_polling();                            
                            node.connection.readHoldingRegisters(Number(node.adr), Number(node.quantity)).then(function (resp, error) { 
                                if (modbus_error_check(error) && resp) {
                                    set_connected_waiting();
                                    msg.payload = resp.register; // array of register values
                                    node.send(msg);
                                }
                            });
                            break;
                        case "InputRegister": //FC: 4                        
                            set_connected_polling();                                                       
                            node.connection.readInputRegisters(Number(node.adr), Number(node.quantity)).then(function (resp, error) { 
                                if (modbus_error_check(error) && resp) {                                 
                                    set_connected_waiting();
                                    msg.payload = resp.register; // array of register values
                                    node.send(msg);                                    
                                }                                                               
                            });
                            break;
                    }
                } 
                    

            node.on("close", function () {  
                log(node.name + ':' + 'Closing')              
                clearInterval(timerID);
                timerID = null;                
                node.connection.removeListener('connect', node.receiveEvent2);
                node.connection.removeListener('close', node.receiveEvent1);
                node.status({fill:"grey",shape:"dot",text:"Disconnected"});
                node.connection.close();
                
            });
        
    }
    
    RED.nodes.registerType("modbustcp-read", ModbusTCPRead);

};
