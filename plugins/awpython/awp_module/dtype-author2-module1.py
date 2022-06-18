awp_frameNeeded = 3
def awp_detection(frame=[]):
    returnData = []
    if len(frame) < 1:
        return returnData
    
    matrix = {}
    matrix["tag"] = "dtype-author2-module1"
    matrix["x"] = 125
    matrix["y"] = 75
    matrix["w"] = 50
    matrix["h"] = 100
    returnData.append(matrix)

    return returnData
