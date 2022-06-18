import cv2
import numpy as np

awp_frameNeeded = 1
def awp_detection(frame=[]):
    returnData = []
    if len(frame) < 1:
        return returnData

    frm = frame[0]
    im_blur = cv2.GaussianBlur(frm, (21, 21), 0)
    im_hsv = cv2.cvtColor(im_blur, cv2.COLOR_BGR2HSV)

    lower = [18, 50, 50]
    upper = [35, 255, 255]
    lower = np.array(lower, dtype="uint8")
    upper = np.array(upper, dtype="uint8")
    mask = cv2.inRange(im_hsv, lower, upper)

    im = cv2.bitwise_and(frm, im_hsv, mask=mask)
    no_red = cv2.countNonZero(mask)

    im_bw = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    ret, thresh = cv2.threshold(im_bw, 127, 255, 0)
    contours, hierarchy = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    for c in contours:
        #d = max(contours, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(c)
        
        matrix = {}
        matrix["tag"] = "fire-niladri30"
        matrix["x"] = x
        matrix["y"] = y
        matrix["w"] = w
        matrix["h"] = h
        returnData.append(matrix)

    return returnData
