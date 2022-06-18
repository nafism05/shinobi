var config = require('./conf.json');
var s
try{
	s = require('../pluginBase.js')(__dirname,config);
}catch(err){
	console.log(err);
	try{
		s = require('./pluginBase.js')(__dirname,config);
	}catch(err){
		console.log(err);
		return console.log(config.plug,'Plugin start has failed. pluginBase.js was not found.');
	}
}

var fs = require('fs');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var socketIoClient = require('socket.io-client');

var os = require('os');
var ifaces = os.networkInterfaces();
var iface_address = "";
Object.keys(ifaces).forEach(function(ifname){
	if(ifname==="enp0s3"){
		ifaces[ifname].forEach(function(iface){
			if(iface.family==="IPv4"){
				iface_address = iface.address
			}
		});
	}
});

if(config.awpmoduleDir===undefined){config.awpmoduleDir=__dirname+'/awp_module/'}
s.findAwpmodule=function(callback){
	var foundAwpmodule=[];
	fs.readdirSync(config.awpmoduleDir).forEach(file=>{
		if(file!=="__init__.py"&&file.length>3&&file.substr(-3,3)===".py"){
			foundAwpmodule.push(file.substr(0,(file.length-3)));
		}
	});
	s.awpmoduleDir=foundAwpmodule;
	s.systemLog('Found '+foundAwpmodule.length+' Awpmodule');
	callback(foundAwpmodule);
}
s.onPluginEventExtender(function(d,cn,tx){
	switch(d.f){
		case'refreshAwpmodule':
			s.findAwpmodule(function(awpmodule){
				//s.systemLog("AWLog-shinobi-awpython - refreshAwpmodule -",awpmodule);
				s.cx({f:'s.tx',data:{f:'detector_awpmodule_list',awpmodule:awpmodule},to:'GRP_'+d.ke});
			})
		break;
		case'readPlugins':
			s.findAwpmodule(function(awpmodule){
				//s.systemLog("AWLog-shinobi-awpython - readPlugins -",awpmodule);
				s.cx({f:'s.tx',data:{f:'detector_awpmodule_list',awpmodule:awpmodule},to:'GRP_'+d.ke});
			})
		break;
	}
})

s.detectObject=function(buffer,d,tx,frameLocation){
	//s.systemLog("AWLog-shinobi-awpython");
	d.tmpFile=s.gid(5)+'.jpg';
	if(!fs.existsSync(s.dir.streams)){
		fs.mkdirSync(s.dir.streams);
	}
	d.dir=s.dir.streams+d.ke+'/';
	if(!fs.existsSync(d.dir)){
		fs.mkdirSync(d.dir);
	}
	d.dir=s.dir.streams+d.ke+'/'+d.id+'/';
	if(!fs.existsSync(d.dir)){
		fs.mkdirSync(d.dir);
	}
	fs.writeFile(d.dir+d.tmpFile,buffer,function(err){
		if(err) return s.systemLog(err);
		if(s.isPythonRunning===false){
			return console.log('Python Script is not Running.');
		}
		var callbackId=s.gid(10);
		s.group[d.ke][d.id].sendToPython({id:callbackId,path:d.dir+d.tmpFile,trackerId:d.ke+d.id,awpmodule:d.mon.detector_awpmodule},function(data){
			if(data.length > 0){
				var mats=[];
				data.forEach(function(v){
					mats.push({
						x:v.x,
						y:v.y,
						width:v.w,
						height:v.h,
						tag:v.tag
					})
			  	})
			  	//s.systemLog("AWLog-shinobi-awpython -",data);
				s.cx({
					f:'trigger',
					id:d.id,
					ke:d.ke,
					details:{
						plug:config.plug,
						name:'awpython',
						reason:'object',
						matrices:mats,
						imgHeight:parseFloat(d.mon.detector_scale_y),
						imgWidth:parseFloat(d.mon.detector_scale_x),
						shinobi_ip:iface_address
					}
				})
			}
			delete(s.callbacks[callbackId]);
			exec('rm -rf '+d.dir+d.tmpFile,{encoding:'utf8'});
		})
	})
}

//exec("kill $(ps aux | grep '[p]ython3 pumpkin.py' | awk '{print $2}')");
exec("kill $(ps aux | grep 'awp_main.py' | awk '{print $2}')");
if(!config.pythonScript){config.pythonScript=__dirname+'/awp_main.py'}
if(!config.pythonPort){config.pythonPort=7990}

s.awPythonEventController=function(d,cn,tx){
	switch(d.f){
		case'init_monitor':
			s.group[d.ke][d.id].refreshTracker(d.ke+d.id);
		break;
		case'frame':
			var engine = s.createCameraBridgeToPython(d.ke+d.id);
			s.group[d.ke][d.id]={
				sendToPython:engine.sendToPython,
				refreshTracker:engine.refreshTracker
			}
		break;
	}
}
//Start Python Controller
s.callbacks = {};
s.createCameraBridgeToPython=function(uniqueId){
	s.systemLog("AWLog-shinobi-awpython - createCameraBridgeToPython RUNNING");
	var pythonIo=socketIoClient('ws://localhost:'+config.pythonPort,{transports:['websocket']});
	var sendToPython=function(data,callback){
		s.callbacks[data.id]=callback;
		pythonIo.emit('f',data);
	}
	var refreshTracker=function(data){
		pythonIo.emit('refreshTracker',{trackerId:data});
	}

	pythonIo.on('connect',function(d){
		s.systemLog("AWLog-shinobi-awpython - "+uniqueId+" is Connected from Python");
	})
	pythonIo.on('disconnect',function(d){
		s.systemLog("AWLog-shinobi-awpython - "+uniqueId+" is Disconnected from Python");
		setTimeout(function(){
			pythonIo.connect();
			s.systemLog("AWLog-shinobi-awpython - "+uniqueId+" is Attempting to Reconect to Python");
		},3000)
	})
	pythonIo.on('f',function(d){
		if(s.callbacks[d.id]){
			s.callbacks[d.id](d.data);
			delete(s.callbacks[d.id]);
		}
	})
	return {sendToPython:sendToPython,refreshTracker:refreshTracker};
}
//Start Python Daemon
process.env.PYTHONUNBUFFERED = 1;
s.createPythonProcess=function(){
	s.systemLog("AWLog-shinobi-awpython - createPythonProcess RUNNING");
	s.isPythonRunning=false;
	s.pythonScript=spawn('sh',[__dirname+'/bootPy.sh',config.pythonScript,__dirname]);

	var onStdErr=function(data){
		s.systemLog("AWLog-shinobi-awpython - "+data.toString());
	}
	var onStdOut=function(data){
		s.systemLog("AWLog-shinobi-awpython - "+data.toString());
	}
	setTimeout(function(){
		s.isPythonRunning = true;
		s.systemLog("AWLog-shinobi-awpython - Python RUNNING");
	},5000)

	s.pythonScript.stderr.on('data',onStdErr);
	s.pythonScript.stdout.on('data',onStdOut);
	s.pythonScript.on('close',function(){
		s.systemLog("AWLog-shinobi-awpython - Python CLOSED");
	});
}
s.createPythonProcess();
