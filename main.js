//Import libraries
import * as dat from './libs/dat.gui.module.js';
import './libs/gl-matrix-min.js';

//Import utility functions
import * as glutils from './glutils.js';
import { imgload } from './imgload.js';

const vsSource = await (await fetch('vs.fx')).text();
const fsSource = await (await fetch('fs.fx')).text();

const mat4 = window.glMatrix.mat4;
const vec3 = window.glMatrix.vec3;

//Image load
const image = await imgload('HEAD_BRAIN_20101020_001_004_T2__Ax_T2_Flair_Ax.img');

//setup control object
var minValue = 0;// Math.min(...image.pixelData)
var maxValue = 1000; //Math.max(...image.pixelData)

const settings = {
    black: minValue,
    white: maxValue,
    zoom: 1,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    distance: 2000,
    palette: 1,
};

const paletteSettings = {
    1: "lut/10.png",
    2: "lut/16Step.png",
    3: "lut/lut.png",
    4: "lut/palette1.png",
    5: "lut/palette2.png"
};

//create control interface
const gui = new dat.GUI();
gui.add(settings, 'black', minValue, maxValue);
gui.add(settings, 'white', minValue, maxValue);
gui.add(settings, 'distance', 100, 1000, 1);
gui.add(settings, 'zoom', 0.5, 2, .1);
gui.add(settings, 'rotX', 0, 360, 1);
gui.add(settings, 'rotY', 0, 360, 1);
gui.add(settings, 'rotZ', 0, 360, 1);
gui.add(settings, 'palette', 1, Object.keys(paletteSettings).length, 1);

const {gl, pr, vao, bwLocation, texLocation, lutLocation, wvpLocation, eyePosLocation} = init()
render()

function init() {
    //get canvas ui element and set its internal resolution to align with its actual screen resolution
    const c = document.getElementById("canvas");
    c.width = c.clientWidth;
    c.height = c.clientHeight;

    //get WebGL2 darwing context and exit if not found
    const gl = c.getContext("webgl2")
    if(gl == null) {
        alert("Context not found");
        throw "Context not found";
    }

    var ext = gl.getExtension('OES_texture_float_linear');

    //-compile source code into shaders
    var vs = glutils.createShader(gl, gl.VERTEX_SHADER, vsSource);
    var fs = glutils.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    var pr = glutils.createProgram(gl, vs, fs);
    
    var positionAttributeLocation = gl.getAttribLocation(pr, "a_position");
    var texLocation = gl.getUniformLocation(pr, "u_texture");
    var lutLocation = gl.getUniformLocation(pr, "u_lut");
    var bwLocation = gl.getUniformLocation(pr, "bw");
    var wvpLocation = gl.getUniformLocation(pr, "worldViewProjection");
    var eyePosLocation = gl.getUniformLocation(pr, "eyePos");

    //Init texture
    //-init texture object and fill with data
    var texture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_3D, texture);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R32F, image.columns, image.rows, image.slices, 0, gl.RED, gl.FLOAT, image.pixelData);

    //-setup texture interpolation and wrapping modes
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

    // Palette
    var lut = gl.createTexture();

    var palette = new Image();
    palette.src = paletteSettings[settings.palette];
    palette.onload = function() {
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, lut);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, palette);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };

    const geometry = [
		0, 1, 0,
        1, 1, 0,
        0, 0, 0,
        1, 0, 0,
        0, 1, 1,
        1, 1, 1,
        0, 0, 1,
        1, 0, 1,
    ];

    const triangles = [
		0, 1, 2,
        1, 2, 3,
        2, 3, 6,
        3, 6, 7,
        6, 7, 4,
        7, 4, 5,
        4, 5, 0,
        5, 0, 1,
        1, 3, 5,
        3, 5, 7,
        0, 4, 2,
        4, 2, 6
    ];

    //-create vertex array to store geometry data
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    //-init position buffer and fill with data
    var positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry), gl.STATIC_DRAW);
    //-assign buffer to position attribute
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 3, gl.FLOAT, false, 0, 0);
    //-init index buffer and fill with data
    var indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(triangles), gl.STATIC_DRAW);

    //-setup additional pipeline parameters (enable depth filtering)
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    //enable scissor to prevent clearing of other viewports
    gl.enable(gl.SCISSOR_TEST);

    return {gl, pr, vao, bwLocation, texLocation, lutLocation, wvpLocation, eyePosLocation};
}

function render() {
    let aspect = initViewport({x: 0, y: 0, width: gl.canvas.width, height: gl.canvas.height});
    renderWithParameters(worldMatrix(), viewMatrix(), projectionMatrix(aspect));
    requestAnimationFrame(render);
}

function initViewport(region) {
    //setup drawing area
    gl.viewport(region.x, region.y, region.width, region.height);
    //
    gl.scissor(region.x, region.y, region.width, region.height);
    //set clear color
    gl.clearColor(.1, .1, .1, 1);
    //set clear mode (clear color & depth)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    return region.width / region.height;
}

function renderWithParameters(world, view, proj){
    // Palettes
    var lut = gl.createTexture();
    var palette = new Image();
    palette.src = paletteSettings[settings.palette];
    palette.onload = function() {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, lut);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, palette);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };

    let wvp = mat4.create();
    mat4.mul(wvp, wvp, proj);
    mat4.mul(wvp, wvp, view);
    mat4.mul(wvp, wvp, world);

    //use graphic pipeline defined by shader program *pr*
    gl.useProgram(pr);
    //set geometry to draw
    gl.bindVertexArray(vao);

    gl.uniform2fv(bwLocation, [settings.black, settings.white]);

    let iv = mat4.invert(mat4.create(), view);
    let iw = mat4.invert(mat4.create(), world);
    var m = mat4.mul(mat4.create(), iw, iv);

    let eye = vec3.transformMat4(vec3.create(), [0, 0, 0], m);

    gl.uniform3fv(eyePosLocation, eye);

	gl.uniform1i(texLocation, 0);
	gl.uniform1i(lutLocation, 1);

    gl.uniformMatrix4fv(wvpLocation, false, wvp);

    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
}

function worldMatrix() {
    let world = mat4.create();
    mat4.set(world, ...image.xort, 0, ...image.yort, 0, ...image.zort, 0, 0, 0, 0, 1);

    var imgSize = [
        image.columns * image.pixelSpacingX, 
        image.rows * image.pixelSpacingY, 
        image.slices * image.pixelSpacingZ
    ];
    
    mat4.scale(world, world, imgSize);
    mat4.translate(world, world, [-.5, -.5, -.5]);

    return world;
}

function viewMatrix() {
    let view = mat4.lookAt(mat4.create(), [settings.distance, settings.distance, settings.distance], [0, 0, 0], [0, 0, 1]);
    mat4.rotateX(view, view, settings.rotX / 180 * Math.PI);
    mat4.rotateY(view, view, settings.rotY / 180 * Math.PI);
    mat4.rotateZ(view, view, settings.rotZ / 180 * Math.PI);

    return view;
}

function projectionMatrix(aspect) {
    return mat4.perspective(mat4.create(), 0.5, aspect, 0.1, 10000);
}
