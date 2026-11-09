const admin=require('../../services/admin');
const student=require('../../services/api');
Page({
 onShareAppMessage(){return {title:'成人高考报名',path:'/pages/index/index'};},data:{busy:false,error:'',binding:false,username:'',password:''},
 input(e){this.setData({[e.currentTarget.dataset.key]:e.detail.value});},
 bindTeacher(){this.setData({binding:!this.data.binding,error:''});},
 async goMine(){await this.enter(false);},
 async bindAccount(){await this.enter(true);},
 async enter(bind){if(this.data.busy)return;this.setData({busy:true,error:''});try{
 const result=await admin.identity(bind?'bindWechat':'wechatLogin',bind?{username:this.data.username,password:this.data.password}:{});
 this.setData({password:''});
 if(result.role==='teacher')wx.reLaunch({url:'/pages/admin/admin'});
 else {await student.login();wx.navigateTo({url:'/pages/my/my'});}
 }catch(e){this.setData({error:e.message});}finally{this.setData({busy:false});}},
 goRegister(){this.goMine();},goSearch(){wx.navigateTo({url:'/pages/search/search'});},goStatus(){wx.navigateTo({url:'/pages/status/status'});}
});
