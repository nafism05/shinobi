import pkgutil, importlib, copy
import cv2
import awp_module

from flask import Flask, request, jsonify, render_template
from flask_socketio import SocketIO, emit
import os, sys, json
import numpy as np

class ClientModule:
    def __init__(self, name, frame=[]):
        self.name = name
        self.frame = frame[:]

rootModule = "awp_module"
listOfModule, listOfClient = {}, {}
for importer, name, ispkg in pkgutil.iter_modules(awp_module.__path__):
    temp = importlib.import_module(rootModule + "." + name)
    found = True
    try:
        temp.awp_frameNeeded
        temp.awp_detection()
    except AttributeError:
        found = False
        print(name + " - awp_frameNeeded and/or awp_detection() not found...")

    if found:
        listOfModule[name] = temp

def createClient(trackerId, module=[]):
    global listOfClient
    try:
        listOfClient[trackerId]
    except KeyError:
        listOfClient[trackerId] = None

    if listOfClient[trackerId] is None and len(module) > 0:
        clientModule = []
        for i in range(len(module)):
            for oneModule in listOfModule:
                if module[i] == oneModule:
                    clientModule.append(ClientModule(module[i]))
                    break
        listOfClient[trackerId] = clientModule[:]
    elif listOfClient[trackerId] is not None:
        # Add
        for i in range(len(module)):
            found = False
            for j in range(len(listOfClient[trackerId])):
                if module[i] == listOfClient[trackerId][j].name:
                    found = True
                    break
            if not found:
                for oneModule in listOfModule:
                    if module[i] == oneModule:
                        listOfClient[trackerId].append(ClientModule(module[i]))
                        break
        # Remove
        idx = []
        for i in range(len(listOfClient[trackerId])):
            if listOfClient[trackerId][i].name not in module:
                print(trackerId + " - " + listOfClient[trackerId][i].name + " TIDAK ADA")
                idx.append(i)
        for i in range(len(idx)):
            listOfClient[trackerId].pop(idx[i])

def printClient():
    for oneClient in listOfClient:
        print(oneClient)
        for i in range(len(listOfClient[oneClient])):
            print(listOfClient[oneClient][i].name + " : " + str(len(listOfClient[oneClient][i].frame)))
            #print(listOfClient[oneClient][i].name + " : " + str(listOfClient[oneClient][i].frame))
        print()

def insertFrame(frame, trackerId, module=["author1-module1"]):
    createClient(trackerId, module)
    returnData = []
    if listOfClient[trackerId]:
        for i in range(len(listOfClient[trackerId])):
            moduleName = listOfClient[trackerId][i].name
            frameNeeded = listOfModule[moduleName].awp_frameNeeded

            listOfClient[trackerId][i].frame.append(frame)
            frameCurrent = len(listOfClient[trackerId][i].frame)

            if frameCurrent > frameNeeded:
                listOfClient[trackerId][i].frame = listOfClient[trackerId][i].frame[1:]
                frameCurrent = len(listOfClient[trackerId][i].frame)

            if frameCurrent == frameNeeded:
                sendFrame = listOfClient[trackerId][i].frame[:]
                returnData = returnData + listOfModule[moduleName].awp_detection(sendFrame)
                #print(returnData)
    
    return returnData

default_trackerId = "TRACKERID1"
default_module = ["author1-module1", "author2-module1"] #["niladri30-fire_detection"]

'''for i in range(10):
    insertFrame(i, default_trackerId, default_module)
    printClient()

def sendFrame(path_video="./video.avi"):
    video = cv2.VideoCapture(path_video)
    success, ct, leap_of_frame = True, 0, 5
    
    while success:
        success, frame = video.read() #[B,G,R], already np.uint8
        ct = ct + 1
        if ct % leap_of_frame != 0:
            continue
        if success:
            insertFrame(frame, default_trackerId, default_module)
            #printClient()

    video.release()
    cv2.destroyAllWindows()

sendFrame()'''

dirname = sys.argv[1]
try:
    with open("{}/conf.json".format(dirname)) as json_file:
        config = json.load(json_file)
        httpPort = config['pythonPort']
        try:
            httpPort
        except NameError:
            httpPort = 7990
except Exception as e:
    print("conf.json not found.")
    httpPort = 7990

# Load Flask
app = Flask("Contour Detection for Shinobi (Pumpkin Pie)")
socketio = SocketIO(app)

# Detection function
def spark(filepath, trackerId, awpmodule):
    try:
        filepath
    except NameError:
        return "File path not found."
    frame = cv2.imread(filepath)

    returnData = []
    if awpmodule != None:
        awpmodule = json.loads(awpmodule)
        module = []
        for oneAwpmodule in awpmodule:
            module.append(oneAwpmodule)

        returnData = insertFrame(frame, trackerId, module)
    else:
        matrix = {}
        matrix["tag"] = "Yes! AwPython Running..."
        matrix["x"] = 50
        matrix["y"] = 75
        matrix["w"] = 100
        matrix["h"] = 100

        returnData.append(matrix)
    return returnData
    
@app.route('/', methods=['GET'])
def index():
    return "Pumpkin.py is running. This web interface should NEVER be accessible remotely. The Node.js plugin that runs this script should only be allowed accessible remotely."

# bake the image data by a file path
# POST body contains the "img" variable. The value should be to a local image path.
# Example : /dev/shm/streams/[GROUP_KEY]/[MONITOR_ID]/s.jpg
@app.route('/post', methods=['POST'])
def post():
    filepath = request.form['img']
    return jsonify(spark(filepath))

# bake the image data by a file path
# GET string contains the "img" variable. The value should be to a local image path.
# Example : /dev/shm/streams/[GROUP_KEY]/[MONITOR_ID]/s.jpg
@app.route('/get', methods=['GET'])
def get():
    filepath = request.args.get('img')
    return jsonify(spark(filepath))

@socketio.on('f')
def receiveMessage(message):
    emit('f', {'id':message.get("id"), 'data':spark(message.get("path"), message.get("trackerId"), message.get("awpmodule"))})

# quick-and-dirty start
if __name__ == '__main__':
    socketio.run(app, port=httpPort)


