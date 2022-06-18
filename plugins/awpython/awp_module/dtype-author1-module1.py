awp_frameNeeded = 1
def awp_detection(frame=[]):
    returnData = []
    if len(frame) < 1:
        return returnData
    
    matrix = {}
    matrix["tag"] = "dtype-author1-module1"
    matrix["x"] = 50
    matrix["y"] = 50
    matrix["w"] = 50
    matrix["h"] = 100
    returnData.append(matrix)

    return returnData
