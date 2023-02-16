// start pendant

var pendantConfig = {  
  commandIntervalOverride: 10,  // How fast can grbl process the command
  maxRateXoverride: 2000,  // override grbl max rate for pendant jogging
  maxRateYoverride: 2000,  // override grbl max rate for pendant jogging
  maxRateZoverride: 300, // override grbl max rate for penant jogging
  stepSize: ".1", // no way to know selected step size or startup.  so use this value until rotary switch is turned.  its in mm
  commands: {
    coolant: 'M8',
  },
  joyThrowMap: [.05, .05, .05, .05, .05, .05, .05, .06, .08, .11, .14, .17, .19,
    .22, .25, .28, .31, .33, .36, .39, .42, .45, .48, .51, .53, .56,
    .59, .62, .65, .67, .69, .71, .74, .77, .80, .83, .86, .89, .92, .94, .97, 1],
};
socket.emit('pendantConfig', pendantConfig);

var data = {
  port: "COM8",
  baud: 57600,
  type: "usb"
};
socket.emit('connectPendant', data);

socket.on("fromPendant", function(data) {
  
  if (data == 'clickRun') {  // start job
    //probably need to check if file is loaded here
    $('#runBtn').click();
    return;
  } 

  if (data.slider != undefined) {  // adjust sliiders
    switch(true) {
      case ((data.slider == 1) && (data.direction == 1)):
        //Increase feed
        var newfeed = laststatus.machine.overrides.feedOverride + 10
        feedOverride(newfeed);
        break;
      case ((data.slider == 1) && (data.direction == 2)):
        //Decrease feed
        var newfeed = laststatus.machine.overrides.feedOverride - 10
        feedOverride(newfeed);
        break;
      case ((data.slider == 2) && (data.direction == 1)):
        //Increase spindle
        var newspeed = laststatus.machine.overrides.spindleOverride + 10
        spindleOverride(newspeed);
        break;
      case ((data.slider == 2) && (data.direction == 2)):
        //Decrease spindle
        var newspeed = laststatus.machine.overrides.spindleOverride - 10
        spindleOverride(newspeed);
        break;
      case ((data.slider == 4) && (data.direction == 1)):
        //Increase jog
        var currentJogOverride = $('#jro').data('slider').val();
        var newVal = currentJogOverride + 1
        if (newVal > 100) {
          newVal = 100;
        }
        jogOverride(newVal)
        break;
      case ((data.slider == 4) && (data.direction == 2)):
        //Decrease jog
        var currentJogOverride = $('#jro').data('slider').val();
        var newVal = currentJogOverride - 1
        if (newVal < 1) {
          newVal = 1;
        }
        jogOverride(newVal)
        break;

      default:
        break;

    }
    delete data.slider;  //probably not needed
  }

});

// stop pendant
socket.emit('closePendantPort', 1);