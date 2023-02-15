// start pendant

var pendantConfig = {  
  commandIntervalOverride: 10,  // How fast can grbl process the command
  maxRateXoverride: 2500,  // override grbl max rate for pendant jogging
  maxRateYoverride: 2500,  // override grbl max rate for pendant jogging
  maxRateZoverride: 300, // override grbl max rate for penant jogging
  commands: {
    stop: 'STOP',
    

  }
};
socket.emit('pendantConfig', pendantConfig);

var data = {
  port: "COM3",
  baud: 9600,
  type: "usb"
};
socket.emit('connectPendant', data);


// stop pendant
socket.emit('closePendantPort', 1);