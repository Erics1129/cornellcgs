import {spawn} from 'node:child_process'
import {existsSync,readFileSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
const editor=process.env.UNITY_EDITOR||'/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity'
if(!existsSync(editor))throw new Error('Set UNITY_EDITOR to Unity 6000.3.18f1 with Web Build Support installed.')
mkdirSync('output',{recursive:true})
const test=process.argv.includes('--test')
const log=resolve(`output/carrot-unity-${test?'test':'build'}.log`)
const child=spawn(editor,['-batchmode','-nographics','-projectPath',resolve('unity/CarrotDefense'),'-buildTarget','WebGL','-executeMethod',test?'CarrotTD.CarrotSimulationTests.Run':'CarrotTD.CarrotBuild.Web','-quit','-logFile',log],{stdio:'inherit'})
child.on('error',error=>{console.error(error.message);process.exitCode=1})
child.on('exit',code=>{if(code){if(existsSync(log))console.error(readFileSync(log,'utf8').slice(-10000));process.exitCode=code||1}else console.log(test?'Carrot simulation checks passed.':'Unity Web build ready in public/unity/carrot. Run npm run build to package the website.')})
