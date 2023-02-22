 // Serial
const {
  SerialPort
} = require('serialport')
const {
  ReadlineParser
} = require('@serialport/parser-readline');


//const shuttle = require('shuttle-control-usb');


SerialPort.list(function (err, ports) {
  ports.forEach(function(port) {
    console.log('id ' + port.vendorId)
    if(port.vendorId == 0x0b33){
      console.log('Found It')
      MYport = port.comName.toString();
      console.log(MYport);
    }
  });

  var port = new SerialPort(MYport, {
    parser: SerialPort.parsers.readline('\n')
  });

});

var pendantConfig = {  
  commandIntervalOverride: 10,  // How fast can grbl process the command
  maxRateXoverride: 6000,  // override grbl max rate for pendant jogging
  maxRateYoverride: 6000,  // override grbl max rate for pendant jogging
  maxRateZoverride: 1000, // override grbl max rate for penant jogging
  stepSize: ".1", // no way to know selected step size or startup.  so use this value until rotary switch is turned.  its in mm
  commands: {
    coolant: 'M8',  //M8 for flood or M7 for mist
  },
  joyThrowMap: [.05, .05, .05, .05, .05, .05, .05, .06, .08, .11, .14, .17, .19,
    .22, .25, .28, .31, .33, .36, .39, .42, .45, .48, .51, .53, .56,
    .59, .62, .65, .67, .69, .71, .74, .77, .80, .83, .86, .89, .92, .94, .97, 1],
};

var pendantStatus = {
  pendant: {
    connectionStatus: 0, //0 = not connected, 1 = opening, 2 = connected
    interfaces: {
      type: 'USB',
      activeBaud: "",
      activePort: ""
    },
    alarm: ""
  },
  shuttle: {
    connectionStatus: 0, //0 = not connected, 1 = opening, 2 = connected
    interfaces: {
      type: 'USB',
      activeBaud: "",
      activePort: ""
    },
    alarm: ""
  }
}

// shuttle stuff

window.connectShuttle = function(data) {
  console.log("Shuttle", "Connecting to " + data.port);
  shuttle.on('connected', (deviceInfo) => {
    console.log('Connected to ' + deviceInfo.name);
  });
  
  // Start after 'connect' event listener has been set up
  shuttle.start();


}

  
  
// Pendant stuff  
window.connectPendant = function(data) {

  console.log("Pendant", "Connecting to " + data.port);

  pendantPort  = new SerialPort({
    path: data.port,
    baudRate: parseInt(data.baud),
    hupcl: false // Don't set DTR - useful for X32 Reset
  });
    
  pendantParser = pendantPort.pipe(new ReadlineParser({
    delimiter: '\r\n'
  }));  

  pendantPort.on("error", function(err) {
    if (err.message != "Pendant port is not open") {
      console.log("PENDANT PORT ERROR: ", err.message);

      if (pendantStatus.pendant.connectionStatus > 0) {
        console.log('WARN: Closing Pendant Port ' + pendantPort.path);
        pendantStatus.pendant.connectionStatus = 0;
        stopPendantPort();
      } else {
        console.log('ERROR: Pendant connection not open!');
      }
    }

  });

  pendantPort.on("ready", function(e) {
    pendantPortOpened(pendantPort, data)
  });

  pendantPort.on("open", function(e) {
    pendantPortOpened(pendantPort, data)
  });

  pendantPort.on("close", function() { // open errors will be emitted as an error event
    console.log("PENDANT PORT INFO: Port closed");
    pendantStatus.pendant.connectionStatus = 0;
  }); // end port.onclose


}

function pendantPortOpened(pendantPort, data) {
  console.log("PENDANT PORT INFO: Pendant port is now open: " + pendantPort.path + " - Waiting for commands.");

  pendantStatus.pendant.connectionStatus = 2;
  pendantStatus.pendant.interfaces.activePort = pendantPort.path;
  pendantStatus.pendant.interfaces.activeBaud = pendantPort.baudRate;

  const rotationThreshold = 0.1;
  const commandRateDefault = 10; 
  let xySmoothJogEnabled = false;
  let zSmoothJogEnabled = false;
  let currentDirection = null;
  let zRotation = 0;
  let xyThrow = 0;
  let stepSize = pendantConfig.stepSize;
  let incJog = true;  // always start in inc
  let currentAxis = null;
  let commandRate = Math.max(commandRateDefault, pendantConfig.commandIntervalOverride);
  let maxJogRate = {
    X: Math.min(maxRateX, pendantConfig.maxRateXoverride),
    Y: Math.min(maxRateY, pendantConfig.maxRateYoverride),
    Z: Math.min(maxRateZ, pendantConfig.maxRateZoverride)
  }
  let minJogRate = {
    X: 1000,
    Y: 1000,
    Z: 100
  }
  let maxJogRateX = Math.min(maxRateX, pendantConfig.maxRateXoverride);
  let maxJogRateY = Math.min(maxRateY, pendantConfig.maxRateYoverride);
  let maxJogRateZ = Math.min(maxRateZ, pendantConfig.maxRateZoverride);
  let coolantCmd = (pendantConfig.commands.coolant == 'M9') ? '0xA0' :'0xA1';
  let stopJogCmd = {
    stop: false,
    jog: true,
    abort: false
  }
  let stopCmd = {
    stop: true,
    jog: false,
    abort: false
  }
  newSec = Date.now();
  waitingForOk = false;
  isJogging = false;
  commandCounter = 0;

  HERTZ_LIMIT = 60; // 60 items per second
  FLUSH_INTERVAL = 250; // milliseconds
  QUEUE_LENGTH = Math.floor(HERTZ_LIMIT / (1000 / FLUSH_INTERVAL));

  DEFAULT_FEEDRATE_MIN = 500;
  DEFAULT_FEEDRATE_MAX = 1500;
  DEFAULT_HERTZ = 10; // 10 times per second
  DEFAULT_OVERSHOOT = 1;

  zone = 0;
  axis = '';
  jqueue = [];
  timer = null;
    
  pendantParser.on('data', function(data) {
    //console.log('PENDANT:', data);
    pendantCmd = data.split(",");
    
    
    // serial map
    // 1 X AXIS SELECT  not used
    // 2 Y AXIS SELECT not used
    // 3 Z AXIS SELECT not used
    // 4 COOLANT SELECT done
    // 5 STOP SELECT done
    // 6 PAUSE SELECT done
    // 7 PLAY SELECT done
    // 8 Z UP SELECT 
    // 9 Z DOWN SELECT
    // 10 Origin
    //    1- XZero
    //    2- YZero
    //    3- ZZero
    //    4- X Divide
    //    5- Y Divide
    //    6- Z Divide
    // 11 Overrides
    //     1-Feed done
    //     2-RPM done
    //     3-MaxVelocity not used
    //     4-Jog done
    // 12 Continuous
    //    1-X axis
    //    2-Y axis
    // 13 Stop Jog done
    // 14 .0001 Select done
    // 15 .0010 Select done
    // 16 Step
    //    1-X done
    //    2-Y done
    //    3-Z done
    // 17 JogContinuous    
    // 18 DynamicJoy
    // 19 DynamicWheel

    if (data === "") {  // in case we didnt receive data
      return;
    }

    switch(true) {

      case (pendantCmd[0] == 4):
        
        // in testing it seems that if coolant is on before job start,
        // Control might send a coolant off when the job starts.
        // not a big deal, but need to investigate
        addQRealtime(String.fromCharCode(coolantCmd)); // toggle coolant
        if (status.machine.modals.coolantstate == "M9") {
          status.machine.modals.coolantstate = pendantConfig.commands.coolant;
        } else {
          status.machine.modals.coolantstate = "M9";
        }            
        var output = {
          'command': 'Pendant Message',
          'response': "Toggle coolant.",
          'type': 'info'
        }
        io.sockets.emit('data', output);
        break;

      case (pendantCmd[0] == 5):
        
        console.log('im stopping')
        stop(stopCmd);
        break;
      
      case (pendantCmd[0] == 6):
        
        pause();
        break;

      case (pendantCmd[0] == 7):
        
        if (status.comms.paused) {
          unpause();
          return;
        }
        if (status.comms.runStatus != "Run") {
          // Not sure how to run a loaded file
          // so we will just send a click to the renderer
          io.sockets.emit('fromPendant', 'clickRun');
          return;
        }
        break;

      case ((pendantCmd[0] == 8)  && (status.comms.runStatus == "Idle")):
        // z axis button
        break;

      case ((pendantCmd[0] == 9) && (status.comms.runStatus == "Idle")):
        // z axis button
        break;      
      
      case (pendantCmd[0] == 11):
        // have a look at savetoupdate sliders.  might be something in
        // there we need to do.
        let override = {
          slider: pendantCmd[1],
          direction: pendantCmd[2]
        }
        io.sockets.emit('fromPendant', override );
        break;

      case ((pendantCmd[0] == 12) && (status.comms.runStatus == "Idle")):

        let dir = (pendantCmd[2] > 1) ? -1 : 1;
        axis = (pendantCmd[1] == 1) ? "X" : (pendantCmd[1] == 2) ? "Y" : "Z";
        
        if (axis == 3) { // ignore Z for now
          return;
        }

        //const distance = Math.min(this.actions.getJogDistance(), 1);
        const distance = 1;
        const feedrateMin = 500;
        const feedrateMax = 2500;
        const hertz = 10;
        const overshoot = 1;

        zone = 7;
        
        accumulate(zone, {
          axis: axis,
          distance: distance,
          feedrateMin: feedrateMin,
          feedrateMax: feedrateMax,
          hertz: hertz,
          overshoot: overshoot
        });           

        

        //jogString = `$J=G91 G21 ${axis}${(s).toFixed(2)} F${(f).toFixed(0)}`;

         
        break;    
      
      case ((pendantCmd[0] == 13) && (status.comms.runStatus != "Run")):
        
        zSmoothJogEnabled = false;
        xySmoothJogEnabled = false;
        console.log('stopping jogging')
        stop(stopJogCmd); // not needed but fail safe
        break;

      case (pendantCmd[0] == 14):
        
        stepSize = ".1";
        break;

      case (pendantCmd[0] == 15):
        
        stepSize = "1";
        break;

      case ((pendantCmd[0] == 16) && (status.comms.runStatus == "Idle")):

        jogString = null;
        switch(true) {
          case ((pendantCmd[1] == 1) && (pendantCmd[2] == 1)):
            jogString = `$J=G91 G21 X${stepSize} F${maxJogRateX}`;
            break;
          case ((pendantCmd[1] == 1) && (pendantCmd[2] == 2)):
            jogString = `$J=G91 G21 X-${stepSize} F${maxJogRateX}`;
            break;
          case ((pendantCmd[1] == 2) && (pendantCmd[2] == 1)):
            jogString = `$J=G91 G21 Y${stepSize} F${maxJogRateY}`;
            break;
          case ((pendantCmd[1] == 2) && (pendantCmd[2] == 2)):
            jogString = `$J=G91 G21 Y-${stepSize} F${maxJogRateY}`;
            break;
          case ((pendantCmd[1] == 3) && (pendantCmd[2] == 1)):
            jogString = `$J=G91 G21 Z${stepSize} F${maxJogRateZ}`;
            break;
          case ((pendantCmd[1] == 3) && (pendantCmd[2] == 2)):
            jogString = `$J=G91 G21 Z-${stepSize} F${maxJogRateZ}`;
            break; 
          default:
            break;
        }
        if(jogString) {
          addQToEnd(jogString);
          send1Q();
        } 
        break;    
      
      case (pendantCmd[0] == 18):
        // dynamic jogging here
        break;

      default:
        break;
    }




    
    /*
    // things we can only do at when not running a job
    if (status.comms.runStatus != "Run") {           
      

      if (data.startsWith("JD") ) {  // its a jog command
        jogCommand = data.split("|");
        currentDirection = jogCommand[1];
        xyThrow = jogCommand[3];
        zRotation = jogCommand[4];

        if(Math.abs(zRotation) >= rotationThreshold) {
          zSmoothJogEnabled = true;
          return;
        } else if (zSmoothJogEnabled) {
          let stopJog = function() {
            console.log("z jogging stopped");
            zSmoothJogEnabled = false;
            stop(stopJogCmd); // not needed but fail safe
          }
          stopJog();
        }

        var stopSmoothJogging = function() {
          if(!xySmoothJogEnabled){
            return;
          }

          let stopJog = function() {
            console.log("smooth jogging stopped")
            xySmoothJogEnabled = false;
            stop(stopJogCmd); // not needed but fail safe
          }

          stopJog();

          // need more code here
        }

        var startSmoothJogging = function(...selectedAxis) {
          xySmoothJogEnabled = true;
          currentAxis = selectedAxis;
        }
        
        switch(currentDirection) {
          case "CENTER":
            stopSmoothJogging();
            break;
          case "NORTH":
            startSmoothJogging("Y");
            break;
          case "SOUTH":
            startSmoothJogging("Y-");
            break;
          case "EAST":
            startSmoothJogging("X");
            break;
          case "WEST":
            startSmoothJogging("X-");
            break;
          case "NORTHEAST":
            startSmoothJogging("X", "Y");
            break;
          case "NORTHWEST":
            startSmoothJogging("X-", "Y");
            break;
          case "SOUTHEAST":
            startSmoothJogging("X", "Y-");
            break;
          case "SOUTHWEST":
            startSmoothJogging("X-", "Y-");
            break;              
          default:
            break;
        }           

      }
    }   // things we can do when not running
    */
  });   

     
} // end pendantPortOpened




/*

  socket.on('pendantConfig', function(data) {
    pendantConfig = data;
    console.log(JSON.stringify(pendantConfig.commandIntervalOverride))
  });

*/

window.closePendantPort = function() {
  if (pendantStatus.pendant.connectionStatus > 0) {
    console.log('WARN: Closing Pendant Port ' + pendantPort.path);
    stopPendantPort();
  } else {
    console.log('ERROR: Pendant connection not open!');
  }
}



function stopPendantPort() {
  status.pendant.connectionStatus = 0;
  status.pendant.interfaces.activePort = false;
  status.pendant.interfaces.activeBaud = false;
  pendantPort.drain(pendantPort.close());
}

