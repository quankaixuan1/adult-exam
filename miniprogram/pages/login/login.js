const admin=require('../../services/admin');
Page({
 onShareAppMessage(){return {title:'成人高考报名',path:'/pages/index/index'};},data:{busy:false,error:'',binding:false,username:'',password:'',newPassword:'',confirmPassword:''},
 input(e){this.setData({[e.currentTarget.dataset.key]:e.detail.value});},
 bindTeacher(){if(this.data.busy)return;this.setData({binding:!this.data.binding,error:'',password:'',newPassword:'',confirmPassword:''});},
 async goMine(){await this.enter(false);},
 async bindAccount(){const d=this.data;if(d.newPassword.length<10||d.newPassword.length>128){this.setData({error:'请设置10至128位新密码'});return;}if(d.newPassword!==d.confirmPassword){this.setData({error:'两次新密码输入不一致'});return;}if(d.newPassword===d.password){this.setData({error:'新密码不能与原密码相同'});return;}await this.enter(true);},
 async enter(bind){if(this.data.busy)return;this.setData({busy:true,error:''});try{
 const result=await admin.identity(bind?'bindWechat':'wechatLogin',bind?{username:this.data.username,password:this.data.password,newPassword:this.data.newPassword,confirmPassword:this.data.confirmPassword}:{});
 this.setData({password:'',newPassword:'',confirmPassword:''});
 if(result.role==='teacher')wx.reLaunch({url:'/pages/admin/admin'});
 else {this.setData({binding:true,error:'请先绑定老师管理账号'});}
 }catch(e){this.setData({error:e.message});}finally{this.setData({busy:false});}},
 onUnload(){this.setData({password:'',newPassword:'',confirmPassword:''});}
});
