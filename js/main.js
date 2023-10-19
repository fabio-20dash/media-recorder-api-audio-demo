'use strict';

/* globals MediaRecorder */
// Spec is at http://dvcs.w3.org/hg/dap/raw-file/tip/media-stream-capture/RecordingProposal.html

const apiVideoPostUrlBase = 'http://127.0.0.1:8000/api/video/';

const constraints = {
	"audio": {
		noiseSuppression: false,
		echoCancellation: false
	},
	"video": {
		"width": {
			"min": 320,
			"ideal": 320,
			"max": 320
		},
		"height": {
			"min": 480,
			"ideal": 480,
			"max": 480
		},
		"framerate": 60
	}
};
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const videoId = urlParams.get('id')

if(!videoId) {
	let errorContent = 'Missing videoId as URL query param. Ex: ?id=234791cc-7708-4b28-ad33-0d5c4576b6e9';
	document.getElementsByTagName('body')[0].innerHTML = errorContent;
	throw new Error(errorContent);
}

let recBtn = document.querySelector('button#rec');
let stopBtn = document.querySelector('button#stop');

let liveVideoElement = document.querySelector('#live');
let playbackVideoElement = document.querySelector('#playback');
let dataElement = document.querySelector('#data');
let downloadLink = document.querySelector('a#downloadLink');

liveVideoElement.controls = false;
playbackVideoElement.controls=false;

let mediaRecorder;
let chunks = [];
let count = 0;
let localStream = null;
let soundMeter  = null;
let containerType = "video/webm"; //defaults to webm but we switch to mp4 on Safari 14.0.2+

let bgvideo = document.getElementById('bgvideo')
document.getElementById('bgvideo').addEventListener('ended',videoEndedHandler,false);

function videoEndedHandler(e) {
    // not working yet ..
    console.log('video finalizado .. stopping..')
    document.getElementById("stop").click();
}

if (!navigator.mediaDevices.getUserMedia){
	alert('navigator.mediaDevices.getUserMedia not supported on your browser, use the latest version of Firefox or Chrome');
}else{
	if (window.MediaRecorder == undefined) {
			alert('MediaRecorder not supported on your browser, use the latest version of Firefox or Chrome');
	}else{
		navigator.mediaDevices.getUserMedia(constraints)
			.then(function(stream) {
				localStream = stream;
				
				localStream.getTracks().forEach(function(track) {
					if(track.kind == "audio"){
						track.onended = function(event){
							 log("audio track.onended Audio track.readyState="+track.readyState+", track.muted=" + track.muted);
						}
					}
					if(track.kind == "video"){
						track.onended = function(event){
							log("video track.onended Audio track.readyState="+track.readyState+", track.muted=" + track.muted);
						}
					}
				});
				
				liveVideoElement.srcObject = localStream;
				liveVideoElement.play();
				
				try {
					window.AudioContext = window.AudioContext || window.webkitAudioContext;
					window.audioContext = new AudioContext();
				  } catch (e) {
					log('Web Audio API not supported.');
				  }

				  soundMeter = window.soundMeter = new SoundMeter(window.audioContext);
				  soundMeter.connectToSource(localStream, function(e) {
					if (e) {
						log(e);
						return;
					}else{
					   /*setInterval(function() {
						  log(Math.round(soundMeter.instant.toFixed(2) * 100));
					  }, 100);*/
					}
				  });
				
			}).catch(function(err) {
				/* handle the error */
				log('navigator.getUserMedia error: '+err);
			});
	}
}


function onBtnRecordClicked (){
	if (localStream == null) {
		alert('Could not get local stream from mic/camera');
	}else {
		recBtn.disabled = true;
		stopBtn.disabled = false;

		chunks = [];

		/* use the stream */
		log('Start recording...');
		if (typeof MediaRecorder.isTypeSupported == 'function'){
			/*
				MediaRecorder.isTypeSupported is a function announced in https://developers.google.com/web/updates/2016/01/mediarecorder and later introduced in the MediaRecorder API spec http://www.w3.org/TR/mediastream-recording/
			*/
			let options = {};
			if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
			  options = {mimeType: 'video/webm;codecs=vp9'};
			} else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
			  options = {mimeType: 'video/webm;codecs=h264'};
			} else  if (MediaRecorder.isTypeSupported('video/webm')) {
			  options = {mimeType: 'video/webm'};
			} else  if (MediaRecorder.isTypeSupported('video/mp4')) {
			  //Safari 14.0.2 has an EXPERIMENTAL version of MediaRecorder enabled by default
			  containerType = "video/mp4";
			  options = {mimeType: 'video/mp4'};
			}
			log('Using '+options.mimeType);
            bgvideo.play();
			mediaRecorder = new MediaRecorder(localStream, options);
		}else{
			log('isTypeSupported is not supported, using default codecs for browser');
			mediaRecorder = new MediaRecorder(localStream);
		}

		mediaRecorder.ondataavailable = function(e) {
			log('mediaRecorder.ondataavailable, e.data.size='+e.data.size);
			if (e.data && e.data.size > 0) {
				chunks.push(e.data);
			}
		};

		mediaRecorder.onerror = function(e){
			log('mediaRecorder.onerror: ' + e);
		};

		mediaRecorder.onstart = function(){
			log('mediaRecorder.onstart, mediaRecorder.state = ' + mediaRecorder.state);
			
			localStream.getTracks().forEach(function(track) {
              if(track.kind == "audio"){
                log("onstart - Audio track.readyState="+track.readyState+", track.muted=" + track.muted);
              }
              if(track.kind == "video"){
                log("onstart - Video track.readyState="+track.readyState+", track.muted=" + track.muted);
              }
            });
			
		};

		mediaRecorder.onstop = function(){
			log('mediaRecorder.onstop, mediaRecorder.state = ' + mediaRecorder.state);

			//var recording = new Blob(chunks, {type: containerType});
			let recording = new Blob(chunks, {type: mediaRecorder.mimeType});

			//making request
			let xhr = new XMLHttpRequest();
			//creating form data to append files
			let fd = new FormData();
			//append the recorded blob
			fd.append("file",recording, 'video-'+videoId+'.webm');
			//send data to server..............
			xhr.open('PATCH', apiVideoPostUrlBase + videoId + '/', recording)

			xhr.send(fd);

			downloadLink.href = URL.createObjectURL(recording);


			playbackVideoElement.src = URL.createObjectURL(recording);

			playbackVideoElement.controls = true;
			playbackVideoElement.play();

			let rand =  Math.floor((Math.random() * 10000000));
			let name = '';
			switch(containerType){
				case "video/mp4":
					name  = "video_"+rand+".mp4" ;
					break;
				default:
					name  = "video_"+rand+".webm" ;
			}

			downloadLink.innerHTML = 'Download '+name;

			downloadLink.setAttribute( "download", name);
			downloadLink.setAttribute( "name", name);
		};


		mediaRecorder.onwarning = function(e){
			log('mediaRecorder.onwarning: ' + e);
		};

		
		mediaRecorder.start(1000);

		localStream.getTracks().forEach(function(track) {
			log(track.kind+":"+JSON.stringify(track.getSettings()));
			console.log(track.getSettings());
		})
	}
}

navigator.mediaDevices.ondevicechange = function(event) {
	log("mediaDevices.ondevicechange");
	/*
	if (localStream != null){
		localStream.getTracks().forEach(function(track) {
			if(track.kind == "audio"){
				track.onended = function(event){
					log("audio track.onended");
				}
			}
		});
	}
	*/
}

function onBtnStopClicked(){
	mediaRecorder.stop();
	recBtn.disabled = false;
	stopBtn.disabled = true;
    bgvideo.pause();
}


function onStateClicked(){
	
	if(mediaRecorder != null && localStream != null && soundMeter != null){
		log("mediaRecorder.state="+mediaRecorder.state);
		log("mediaRecorder.mimeType="+mediaRecorder.mimeType);
		log("mediaRecorder.videoBitsPerSecond="+mediaRecorder.videoBitsPerSecond);
		log("mediaRecorder.audioBitsPerSecond="+mediaRecorder.audioBitsPerSecond);

		localStream.getTracks().forEach(function(track) {
			if(track.kind == "audio"){
				log("Audio: track.readyState="+track.readyState+", track.muted=" + track.muted);
			}
			if(track.kind == "video"){
				log("Video: track.readyState="+track.readyState+", track.muted=" + track.muted);
			}
		});
		
		log("Audio activity: " + Math.round(soundMeter.instant.toFixed(2) * 100));
	}
	
}

function log(message){
	dataElement.innerHTML = dataElement.innerHTML+'<br>'+message ;
	console.log(message)
}

// Meter class that generates a number correlated to audio volume.
// The meter class itself displays nothing, but it makes the
// instantaneous and time-decaying volumes available for inspection.
// It also reports on the fraction of samples that were at or near
// the top of the measurement range.
function SoundMeter(context) {
  this.context = context;
  this.instant = 0.0;
  this.slow = 0.0;
  this.clip = 0.0;
  this.script = context.createScriptProcessor(2048, 1, 1);
  var that = this;
  this.script.onaudioprocess = function(event) {
	var input = event.inputBuffer.getChannelData(0);
	var i;
	var sum = 0.0;
	var clipcount = 0;
	for (i = 0; i < input.length; ++i) {
	  sum += input[i] * input[i];
	  if (Math.abs(input[i]) > 0.99) {
		clipcount += 1;
	  }
	}
	that.instant = Math.sqrt(sum / input.length);
	that.slow = 0.95 * that.slow + 0.05 * that.instant;
	that.clip = clipcount / input.length;
  };
}

SoundMeter.prototype.connectToSource = function(stream, callback) {
  console.log('SoundMeter connecting');
  try {
	this.mic = this.context.createMediaStreamSource(stream);
	this.mic.connect(this.script);
	// necessary to make sample run, but should not be.
	this.script.connect(this.context.destination);
	if (typeof callback !== 'undefined') {
	  callback(null);
	}
  } catch (e) {
	console.error(e);
	if (typeof callback !== 'undefined') {
	  callback(e);
	}
  }
};
SoundMeter.prototype.stop = function() {
  this.mic.disconnect();
  this.script.disconnect();
};


//browser ID
function getBrowser(){
	var nVer = navigator.appVersion;
	var nAgt = navigator.userAgent;
	var browserName  = navigator.appName;
	var fullVersion  = ''+parseFloat(navigator.appVersion);
	var majorVersion = parseInt(navigator.appVersion,10);
	var nameOffset,verOffset,ix;

	// In Opera, the true version is after "Opera" or after "Version"
	if ((verOffset=nAgt.indexOf("Opera"))!=-1) {
	 browserName = "Opera";
	 fullVersion = nAgt.substring(verOffset+6);
	 if ((verOffset=nAgt.indexOf("Version"))!=-1)
	   fullVersion = nAgt.substring(verOffset+8);
	}
	// In MSIE, the true version is after "MSIE" in userAgent
	else if ((verOffset=nAgt.indexOf("MSIE"))!=-1) {
	 browserName = "Microsoft Internet Explorer";
	 fullVersion = nAgt.substring(verOffset+5);
	}
	// In Chrome, the true version is after "Chrome"
	else if ((verOffset=nAgt.indexOf("Chrome"))!=-1) {
	 browserName = "Chrome";
	 fullVersion = nAgt.substring(verOffset+7);
	}
	// In Safari, the true version is after "Safari" or after "Version"
	else if ((verOffset=nAgt.indexOf("Safari"))!=-1) {
	 browserName = "Safari";
	 fullVersion = nAgt.substring(verOffset+7);
	 if ((verOffset=nAgt.indexOf("Version"))!=-1)
	   fullVersion = nAgt.substring(verOffset+8);
	}
	// In Firefox, the true version is after "Firefox"
	else if ((verOffset=nAgt.indexOf("Firefox"))!=-1) {
	 browserName = "Firefox";
	 fullVersion = nAgt.substring(verOffset+8);
	}
	// In most other browsers, "name/version" is at the end of userAgent
	else if ( (nameOffset=nAgt.lastIndexOf(' ')+1) <
		   (verOffset=nAgt.lastIndexOf('/')) )
	{
	 browserName = nAgt.substring(nameOffset,verOffset);
	 fullVersion = nAgt.substring(verOffset+1);
	 if (browserName.toLowerCase()==browserName.toUpperCase()) {
	  browserName = navigator.appName;
	 }
	}
	// trim the fullVersion string at semicolon/space if present
	if ((ix=fullVersion.indexOf(";"))!=-1)
	   fullVersion=fullVersion.substring(0,ix);
	if ((ix=fullVersion.indexOf(" "))!=-1)
	   fullVersion=fullVersion.substring(0,ix);

	majorVersion = parseInt(''+fullVersion,10);
	if (isNaN(majorVersion)) {
	 fullVersion  = ''+parseFloat(navigator.appVersion);
	 majorVersion = parseInt(navigator.appVersion,10);
	}


	return browserName;
}