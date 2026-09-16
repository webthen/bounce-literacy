import { _decorator, Component, tween, Vec3 } from 'cc';
const { ccclass } = _decorator;

@ccclass('ObstacleBlock')
export class ObstacleBlock extends Component {
    /** 撞击时轻微软化弹性反馈 */
    public onHit() {
        tween(this.node)
            .to(0.04, { scale: new Vec3(0.94, 0.94, 1) })
            .to(0.08, { scale: new Vec3(1.05, 1.05, 1) })
            .to(0.06, { scale: Vec3.ONE })
            .start();
    }
}
