import { _decorator, Component, Node, RigidBody2D, Vec2, Label, Collider2D, Contact2DType, IPhysics2DContact, Vec3 } from 'cc';
import { BallState } from '../core/GameDefines';
import { EventBus, GameEvents } from '../core/EventBus';
const { ccclass, property } = _decorator;

@ccclass('BallController')
export class BallController extends Component {
    @property(Label)
    public wordLabel: Label = null!;

    @property(Node)
    public trailNode: Node = null!; // 高速光晕拖尾

    public word: string = '';
    public state: BallState = BallState.IDLE;

    private _rb: RigidBody2D = null!;
    private _collider: Collider2D = null!;
    private _bounceCount: number = 0;
    private _launchTimestamp: number = 0;

    onLoad() {
        this._rb = this.getComponent(RigidBody2D)!;
        this._collider = this.getComponent(Collider2D)!;
        if (this._rb) {
            this._rb.bullet = true; // 强制启用 CCD (防穿透)
        }
    }

    onEnable() {
        if (this._collider) {
            this._collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        }
    }

    onDisable() {
        if (this._collider) {
            this._collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        }
    }

    public initBall(word: string) {
        this.word = word;
        if (this.wordLabel) {
            this.wordLabel.string = word;
        }
        this.state = BallState.IDLE;
        this._bounceCount = 0;
        if (this._rb) {
            this._rb.linearVelocity = Vec2.ZERO;
            this._rb.angularVelocity = 0;
        }
        if (this.trailNode) {
            this.trailNode.active = false;
        }
    }

    public launch(velocity: Vec2) {
        this.state = BallState.FLYING;
        this._launchTimestamp = Date.now();
        this._rb.linearVelocity = velocity;
        EventBus.emit(GameEvents.BALL_LAUNCHED, { word: this.word });
    }

    private onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
        if (this.state !== BallState.FLYING) return;

        this._bounceCount++;
        const targetNode = otherCollider.node;

        // 碰到底部传感器或回收
        if (targetNode.name === 'BottomSensor') {
            this.state = BallState.DEAD;
            EventBus.emit(GameEvents.BALL_OUT_OF_BOUNDS, { word: this.word });
            return;
        }

        // 碰撞目标汉字块
        const targetComponent = targetNode.getComponent('TargetBlock') as any;
        if (targetComponent) {
            const isMatch = (targetComponent.word === this.word);
            EventBus.emit(GameEvents.BALL_HIT_TARGET, {
                ballWord: this.word,
                targetWord: targetComponent.word,
                isMatch: isMatch,
                bounceCount: this._bounceCount,
                reactionTime: Date.now() - this._launchTimestamp
            });

            if (isMatch) {
                this.state = BallState.HIT;
                this._rb.linearVelocity = Vec2.ZERO;
                this.node.active = false;
            }
            return;
        }

        // 碰撞普通障碍或超级弹力轮
        if (targetNode.name.startsWith('Bumper')) {
            EventBus.emit(GameEvents.BALL_HIT_BUMPER, { bounceCount: this._bounceCount });
        } else {
            EventBus.emit(GameEvents.BALL_HIT_OBSTACLE, { bounceCount: this._bounceCount });
        }
    }

    update(dt: number) {
        if (this.state === BallState.FLYING) {
            // 控制高速拖尾显示
            const speed = this._rb.linearVelocity.length();
            if (this.trailNode) {
                this.trailNode.active = (speed > 750);
            }

            // 15 秒无命中强制超时软回收（防死循环）
            if (Date.now() - this._launchTimestamp > 15000) {
                this.state = BallState.DEAD;
                EventBus.emit(GameEvents.BALL_OUT_OF_BOUNDS, { word: this.word, isTimeout: true });
            }
        }
    }
}
