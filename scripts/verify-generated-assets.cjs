'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sceneIds = ['denver','manhattan','medieval','kyoto','fuji','lake','coast','forest'];
const phases = ['dawn','morning','noon','afternoon','evening','night'];
const pngSignature = Buffer.from([137,80,78,71,13,10,26,10]);
const minimumSize = {width:1600,height:900};

function jpegDimensions(bytes) {
  if(bytes.length<4)throw new Error('Truncated JPEG image');
  if(bytes.readUInt16BE(0)!==0xffd8)throw new Error('Not a JPEG image');
  let offset=2;
  while(offset+4<bytes.length){
    if(bytes[offset++]!==0xff)continue;
    let marker=bytes[offset++]; while(marker===0xff)marker=bytes[offset++];
    if(marker===0xd9||marker===0xda)break;
    if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
    const length=bytes.readUInt16BE(offset);
    if(length<2||offset+length>bytes.length)throw new Error('Invalid JPEG segment');
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
      if(length<8)throw new Error('Invalid JPEG frame');
      return {width:bytes.readUInt16BE(offset+5),height:bytes.readUInt16BE(offset+3)};
    }
    offset+=length;
  }
  throw new Error('JPEG dimensions not found');
}

function pngDimensions(bytes){
  if(bytes.length<33||!bytes.subarray(0,8).equals(pngSignature))throw new Error('Not a PNG image');
  if(bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR')throw new Error('Invalid PNG header');
  let offset=8,hasData=false,hasEnd=false;
  while(offset+12<=bytes.length){
    const length=bytes.readUInt32BE(offset),end=offset+12+length;
    if(end>bytes.length)throw new Error('Truncated PNG chunk');
    const type=bytes.toString('ascii',offset+4,offset+8);
    if(type==='IDAT'&&length>0)hasData=true;
    if(type==='IEND'){
      if(length!==0||end!==bytes.length)throw new Error('Invalid PNG ending');
      hasEnd=true;break;
    }
    offset=end;
  }
  if(!hasData||!hasEnd)throw new Error('Incomplete PNG image');
  return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
}

function imageDimensions(bytes){
  if(bytes.subarray(0,8).equals(pngSignature))return {format:'png',...pngDimensions(bytes)};
  if(bytes.length>=2&&bytes.readUInt16BE(0)===0xffd8)return {format:'jpeg',...jpegDimensions(bytes)};
  throw new Error('Expected PNG or JPEG image data');
}

// rootDir is injectable for isolated packaging-gate tests. The expected scene
// and phase lists remain fixed, so missing product assets cannot be waived.
function inspectGeneratedAssets({rootDir=root}={}){
  const missing=[],invalid=[],files=[];
  for(const scene of sceneIds){
    let sceneSize;
    const sceneFiles=[];
    for(const phase of phases){
      const relative=`assets/landscapes/generated/${scene}/${phase}.png`;
      const filename=path.join(rootDir,relative);
      if(!fs.existsSync(filename)){missing.push(relative);continue;}
      try{
        const size=imageDimensions(fs.readFileSync(filename));
        if(size.format!=='png')throw new Error('Canonical .png asset must contain PNG image data');
        if(size.width<minimumSize.width||size.height<minimumSize.height)throw new Error(`Native image must be at least ${minimumSize.width}x${minimumSize.height}; received ${size.width}x${size.height}`);
        if(Math.abs(size.width/size.height/(16/9)-1)>.01)throw new Error(`Expected approximately 16:9; received ${size.width}x${size.height}`);
        if(!sceneSize)sceneSize=size;
        sceneFiles.push({file:relative,...size});
      }catch(error){invalid.push({file:relative,reason:error.message});}
    }
    // Preserve native outputs. The generator occasionally rounds one axis
    // by a pixel for the same crop.
    for(const file of sceneFiles){
      if(Math.abs(file.width-sceneSize.width)>1||Math.abs(file.height-sceneSize.height)>1)invalid.push({...file,reason:`All six phases must share native dimensions (${sceneSize.width}x${sceneSize.height}, within one pixel per axis)`});
      else files.push(file);
    }
  }
  return {passed:missing.length===0&&invalid.length===0,expected:sceneIds.length*phases.length,ready:files.length,minimumSize,missing,invalid,files};
}
if(require.main===module){const result=inspectGeneratedAssets();console.log(JSON.stringify(result,null,2));process.exitCode=result.passed?0:1;}
module.exports={inspectGeneratedAssets,jpegDimensions,pngDimensions,imageDimensions};
