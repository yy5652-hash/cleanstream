"""Weight-only int8 for ONNX: MatMul/Gemm/Conv weights stored as int8 with one scale per output channel, dequantized
when the session loads, so all arithmetic stays float32. Download size is about a quarter of float32."""
import numpy as np
import onnx
from onnx import helper, numpy_helper


def weight_only_int8(model: onnx.ModelProto, min_size=4096) -> onnx.ModelProto:
    g = model.graph
    inits = {i.name: i for i in g.initializer}
    new_nodes, drop = [], set()
    for node in g.node:
        wname = None
        if node.op_type == "MatMul" and node.input[1] in inits:
            wname, axis = node.input[1], 1  # weight is K x N: one scale per output column
        elif node.op_type == "Gemm" and node.input[1] in inits:
            transb = next((a.i for a in node.attribute if a.name == "transB"), 0)
            wname, axis = node.input[1], 0 if transb else 1
        elif node.op_type == "Conv" and node.input[1] in inits:
            wname, axis = node.input[1], 0  # one scale per output filter
        if wname is None or wname in drop:
            new_nodes.append(node)
            continue
        w = numpy_helper.to_array(inits[wname]).astype(np.float32)
        if w.ndim < 2 or w.size < min_size:
            new_nodes.append(node)
            continue
        other = tuple(i for i in range(w.ndim) if i != axis)
        scale = np.abs(w).max(axis=other) / 127.0
        scale[scale == 0] = 1.0
        shape = [1] * w.ndim
        shape[axis] = -1
        q = np.clip(np.round(w / scale.reshape(shape)), -127, 127).astype(np.int8)
        qn, sn, zn, dn = wname + "_q", wname + "_scale", wname + "_zp", wname + "_dq"
        g.initializer.extend([numpy_helper.from_array(q, qn), numpy_helper.from_array(scale.astype(np.float32), sn),
                              numpy_helper.from_array(np.zeros_like(scale, dtype=np.int8), zn)])
        new_nodes.append(helper.make_node("DequantizeLinear", [qn, sn, zn], [dn], axis=axis))
        node.input[1] = dn
        new_nodes.append(node)
        drop.add(wname)
    keep = [i for i in g.initializer if i.name not in drop]
    del g.initializer[:]
    g.initializer.extend(keep)
    del g.node[:]
    g.node.extend(new_nodes)
    return model
