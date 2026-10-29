# 3D 模型资源

模型加载顺序：

- `bull-rigged.glb`：三视图重建的一体化连续网格主模型，55骨骼、32动作；
- `bull-rigged-primitive-v3.glb`：第三版骨骼回退资源；
- `bull-rigged-v2.glb`：第二版骨骼回退资源；
- `bull.glb`：旧站立扫描模型。

全部外部模型失效时，渲染器才会使用程序化 Low-Poly 牛，并在3D仍不可恢复时自动切换至独立2D守窗牛。

连续网格重建后的本地处理命令：

```powershell
npm run model:prepare-continuous
npm run model:rig-continuous
npm run model:validate
```
