import { _decorator, Component, Node, Vec2, Vec3, EventTouch, Graphics, UITransform } from 'cc';
import { BallController } from './BallController';
import { AudioManager } from '../managers/AudioManager';
const { ccclass, property } = _decorator;

@ccclass('LauncherController')
export class LauncherController extends Component {
    @property(Node)
    public ballNode: Node = null!; // 当前发射台上的弹珠

    @property(Graphics)
    public aimLineGraphics: Graphics = null!; // 瞄准辅助线绘制

    @property
    public maxDragDistance: number = 135; // 最大拖动距离

    @property
    public speedFactor: number = 10.5;    // 冲量放大系数

    private _anchorPos: Vec2 = new Vec2(0, -250); // 发射底座原点
    private _isDragging: boolean = false;
    private _currentTouchPos: Vec2 = new Vec2();

    onLoad() {
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    public setBallNode(ball: Node) {
        this.ballNode = ball;
        this.ballNode.setPosition(this._anchorPos.x, this._anchorPos.y, 0);
    }

    private onTouchStart(event: EventTouch) {
        if (!this.ballNode || !this.ballNode.active) return;

        const touchPos = event.getUILocation();
        const localPos = this.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(touchPos.x, touchPos.y, 0));

        // 触控判定扩大到 120px，适合 4 岁儿童
        if (Vec2.distance(new Vec2(localPos.x, localPos.y), this._anchorPos) < 120) {
            this._isDragging = true;
            this._currentTouchPos.set(localPos.x, localPos.y);
            this.drawAimGuide();
        }
    }

    private onTouchMove(event: EventTouch) {
        if (!this._isDragging || !this.ballNode) return;

        const touchPos = event.getUILocation();
        const localPos = this.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(touchPos.x, touchPos.y, 0));

        let dragVector = new Vec2(localPos.x - this._anchorPos.x, localPos.y - this._anchorPos.y);
        if (dragVector.length() > this.maxDragDistance) {
            dragVector = dragVector.normalize().multiplyScalar(this.maxDragDistance);
        }

        this._currentTouchPos.set(this._anchorPos.x + dragVector.x, this._anchorPos.y + dragVector.y);
        this.ballNode.setPosition(this._currentTouchPos.x, this._currentTouchPos.y, 0);
        this.drawAimGuide();
    }

    private onTouchEnd(event: EventTouch) {
        if (!this._isDragging) return;
        this._isDragging = false;
        if (this.aimLineGraphics) {
            this.aimLineGraphics.clear();
        }

        const dragVec = new Vec2(this._anchorPos.x - this._currentTouchPos.x, this._anchorPos.y - this._currentTouchPos.y);
        if (dragVec.length() < 22) {
            // 距离过短视为取消，回弹原位
            if (this.ballNode) {
                this.ballNode.setPosition(this._anchorPos.x, this._anchorPos.y, 0);
            }
            return;
        }

        // 发射弹珠
        const launchVelocity = dragVec.multiplyScalar(this.speedFactor);
        const ballCtrl = this.ballNode?.getComponent(BallController);
        if (ballCtrl) {
            AudioManager.instance.playSFX('sfx_shoot');
            ballCtrl.launch(launchVelocity);
        }
    }

    private drawAimGuide() {
        if (!this.aimLineGraphics) return;
        this.aimLineGraphics.clear();

        const dir = new Vec2(this._anchorPos.x - this._currentTouchPos.x, this._anchorPos.y - this._currentTouchPos.y);
        const length = dir.length();
        if (length < 18) return;

        const normal = dir.normalize();
        this.aimLineGraphics.strokeColor.fromHEX('#FFA000');
        this.aimLineGraphics.lineWidth = 5;

        // 绘制辅助预测虚线点
        for (let i = 45; i < 400; i += 28) {
            const px = this._anchorPos.x + normal.x * i;
            const py = this._anchorPos.y + normal.y * i;
            this.aimLineGraphics.circle(px, py, 4);
            this.aimLineGraphics.fillColor.fromHEX('#FFD54F');
            this.aimLineGraphics.fill();
        }
    }
}
