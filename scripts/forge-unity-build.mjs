import {spawn} from 'node:child_process'
import {existsSync,readFileSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
const editor=process.env.UNITY_EDITOR||'/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity'
if(!existsSync(editor))throw new Error('Set UNITY_EDITOR to the Unity 6000.3.18f1 executable, with Web Build Support installed.')
mkdirSync('output',{recursive:true})
const log=resolve('output/forge-unity-build.log')
const child=spawn(editor,['-batchmode','-nographics','-projectPath',resolve('unity/ForgeOrFold'),'-buildTarget','WebGL','-executeMethod','ForgeBuild.Web','-quit','-logFile',log],{stdio:'inherit'})
child.on('error',error=>{console.error(error.message);process.exitCode=1})
child.on('exit',code=>{if(code){if(existsSync(log))console.error(readFileSync(log,'utf8').slice(-8000));process.exitCode=code||1}else console.log('Unity Web build ready in public/unity/forge. Run npm run build to package the website.')})
